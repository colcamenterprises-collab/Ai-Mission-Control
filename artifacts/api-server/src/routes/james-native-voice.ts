import { Router, type IRouter } from "express";
import { createRateLimit } from "../lib/rate-limit.js";

const router: IRouter = Router();

const DEFAULT_PROXY_BASE_PATH = "/hermes-james";

function normalizedBasePath(value: string | undefined): string {
  const raw = (value ?? DEFAULT_PROXY_BASE_PATH).trim();
  if (!raw) return DEFAULT_PROXY_BASE_PATH;
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

router.get(
  "/james/native-voice/config",
  createRateLimit("james-native-voice-config", 30, 60_000),
  (_req, res): void => {
    const sessionToken = process.env.HERMES_JAMES_SESSION_TOKEN?.trim() ?? "";
    const proxyBasePath = normalizedBasePath(
      process.env.HERMES_JAMES_PROXY_BASE_PATH,
    );

    if (!sessionToken) {
      res.status(503).json({
        available: false,
        mode: "hermes-native",
        error: "Hermes native voice is not configured",
        details:
          "HERMES_JAMES_SESSION_TOKEN is missing from the Mission Control API service.",
      });
      return;
    }

    res.json({
      available: true,
      mode: "hermes-native",
      proxyBasePath,
      sessionToken,
      stt: "hermes",
      tts: "hermes",
      conversation: "tui-gateway-json-rpc",
      browserSpeechRecognition: false,
      browserSpeechSynthesis: false,
    });
  },
);

export default router;
