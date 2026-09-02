import { Router, type IRouter } from "express";
import { createRateLimit } from "../lib/rate-limit.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const DEFAULT_HERMES_VOICE_URL = "http://127.0.0.1:9120";
const MAX_AUDIO_DATA_URL_CHARS = 32 * 1024 * 1024;
const MAX_SPEAK_TEXT_CHARS = 12_000;
const SHORT_TIMEOUT_MS = 15_000;
const AUDIO_TIMEOUT_MS = 180_000;

const VOICE_ACTIONS = new Set(["status", "transcribe", "speak", "ws-ticket"]);

type VoiceAction = "status" | "transcribe" | "speak" | "ws-ticket";

function hermesBaseUrl(): string {
  return (process.env.HERMES_JAMES_VOICE_URL?.trim() || DEFAULT_HERMES_VOICE_URL).replace(/\/$/, "");
}

function hermesToken(): string {
  return (
    process.env.HERMES_JAMES_SESSION_TOKEN?.trim() ||
    process.env.HERMES_DASHBOARD_SESSION_TOKEN?.trim() ||
    ""
  );
}

function safeString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

async function forwardHermes(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {},
): Promise<Response> {
  const token = hermesToken();
  if (!token) throw new Error("Hermes native voice session token is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? SHORT_TIMEOUT_MS,
  );

  try {
    return await fetch(`${hermesBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "X-Hermes-Session-Token": token,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

router.post(
  "/james/message",
  createRateLimit("james-native-voice-bridge", 90, 60_000),
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
      } else if (voiceAction === "transcribe") {
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
      } else {
        const text = safeString(req.body?.text, MAX_SPEAK_TEXT_CHARS);
        if (!text) {
          res.status(400).json({
            error: "Invalid native voice speech payload",
            details: "text is required and must be within limits",
          });
          return;
        }
        upstream = await forwardHermes("/api/audio/speak", {
          method: "POST",
          body: { text },
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
          // Fall through and return the upstream text without pretending it is JSON.
        }
      }
      res.type(contentType || "text/plain").send(raw);
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
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
