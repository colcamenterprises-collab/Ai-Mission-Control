import { Router, type IRouter } from "express";
import { createRateLimit } from "../lib/rate-limit.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const DEFAULT_HERMES_VOICE_URL = "http://127.0.0.2:9120";
const MAX_AUDIO_DATA_URL_CHARS = 32 * 1024 * 1024;
const MAX_SPEAK_TEXT_CHARS = 4_000;
const SHORT_TIMEOUT_MS = 15_000;
const AUDIO_TIMEOUT_MS = 180_000;

const VOICE_ACTIONS = new Set(["status", "transcribe", "ws-ticket", "speak"]);
type VoiceAction = "status" | "transcribe" | "ws-ticket" | "speak";

let cachedHermesCookie = "";
let loginPromise: Promise<string> | null = null;

function hermesBaseUrl(): string {
  return (process.env.HERMES_JAMES_VOICE_URL?.trim() || DEFAULT_HERMES_VOICE_URL).replace(/\/$/, "");
}

function hermesBasicAuth(): { username: string; password: string } {
  const username = (
    process.env.HERMES_JAMES_BASIC_AUTH_USERNAME?.trim() ||
    process.env.HERMES_DASHBOARD_BASIC_AUTH_USERNAME?.trim() ||
    ""
  );
  const password = (
    process.env.HERMES_JAMES_BASIC_AUTH_PASSWORD?.trim() ||
    process.env.HERMES_DASHBOARD_BASIC_AUTH_PASSWORD?.trim() ||
    ""
  );
  if (!username || !password) {
    throw new Error("Hermes gated native voice credentials are not configured");
  }
  return { username, password };
}

function safeString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function extractCookieHeader(headers: Headers): string {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const rawCookies = typeof getSetCookie === "function"
    ? getSetCookie.call(headers)
    : [headers.get("set-cookie") ?? ""].filter(Boolean);

  const cookies = rawCookies
    .flatMap((value) => value.split(/,(?=\s*[^;,=]+=[^;,]+)/g))
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter((value): value is string => Boolean(value && value.includes("=")));

  if (cookies.length === 0) {
    throw new Error("Hermes password login did not return a session cookie");
  }
  return cookies.join("; ");
}

async function loginHermes(): Promise<string> {
  if (cachedHermesCookie) return cachedHermesCookie;
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    const { username, password } = hermesBasicAuth();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SHORT_TIMEOUT_MS);
    try {
      const response = await fetch(`${hermesBaseUrl()}/auth/password-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "basic", username, password }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Hermes gated login failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
      }
      cachedHermesCookie = extractCookieHeader(response.headers);
      return cachedHermesCookie;
    } finally {
      clearTimeout(timeout);
      loginPromise = null;
    }
  })();

  return loginPromise;
}

async function forwardHermes(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {},
  allowRelogin = true,
): Promise<Response> {
  const cookie = await loginHermes();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? SHORT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${hermesBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Cookie: cookie,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    if (response.status === 401 && allowRelogin) {
      cachedHermesCookie = "";
      return forwardHermes(path, options, false);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

router.post(
  "/james/message",
  createRateLimit("james-native-voice-bridge", 120, 60_000),
  async (req, res, next): Promise<void> => {
    const action = req.body?.voiceAction;
    if (typeof action !== "string" || !VOICE_ACTIONS.has(action)) {
      next();
      return;
    }

    const voiceAction = action as VoiceAction;
    try {
      let upstream: Response;

      if (voiceAction === "status") {
        upstream = await forwardHermes("/api/status");
      } else if (voiceAction === "ws-ticket") {
        upstream = await forwardHermes("/api/auth/ws-ticket", {
          method: "POST",
          body: {},
        });
      } else if (voiceAction === "speak") {
        const text = safeString(req.body?.text, MAX_SPEAK_TEXT_CHARS);
        if (!text) {
          res.status(400).json({ error: "Invalid native voice speech payload", details: "text is required and must be within limits" });
          return;
        }
        upstream = await forwardHermes("/api/audio/speak", {
          method: "POST",
          body: { text },
          timeoutMs: AUDIO_TIMEOUT_MS,
        });
      } else {
        const dataUrl = safeString(req.body?.data_url, MAX_AUDIO_DATA_URL_CHARS);
        const mimeType = safeString(req.body?.mime_type, 200);
        if (!dataUrl || !mimeType || !dataUrl.startsWith("data:")) {
          res.status(400).json({
            error: "Invalid native voice transcription payload",
            details: "data_url and mime_type are required and must be within limits",
          });
          return;
        }
        upstream = await forwardHermes("/api/audio/transcribe", {
          method: "POST",
          body: { data_url: dataUrl, mime_type: mimeType },
          timeoutMs: AUDIO_TIMEOUT_MS,
        });
      }

      const raw = await upstream.text();
      res.status(upstream.status);
      const contentType = upstream.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          res.json(raw ? JSON.parse(raw) : {});
          return;
        } catch {
          // Return malformed/non-JSON upstream bodies as plain text.
        }
      }
      res.type(contentType || "text/plain").send(raw);
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      logger.error(
        { err: error, voiceAction },
        "James Hermes native voice bridge failed",
      );
      res.status(isAbort ? 504 : 503).json({
        error: isAbort
          ? "Hermes native voice request timed out"
          : "Hermes native voice backend unavailable",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export default router;
