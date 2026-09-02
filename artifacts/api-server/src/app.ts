import path from "node:path";
import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOriginsRaw = process.env.MISSION_CONTROL_ALLOWED_ORIGINS;
const isProd = process.env.NODE_ENV === "production";
const defaultAllowedOrigins = [
  "https://mission.customli.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const envAllowedOrigins = allowedOriginsRaw
  ? allowedOriginsRaw.split(",").map(o => o.trim()).filter(Boolean)
  : [];
const allowedOrigins = Array.from(
  new Set([...defaultAllowedOrigins, ...envAllowedOrigins].filter(origin => !(isProd && origin === "*"))),
);

class CorsForbiddenError extends Error {
  readonly status = 403;
  readonly code = "CORS_FORBIDDEN";

  constructor(readonly origin: string) {
    super("CORS blocked");
  }
}

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const isAllowed = allowedOrigins.includes(origin) || (!isProd && origin.includes("replit.dev"));
    if (isAllowed) return cb(null, true);
    return cb(new CorsForbiddenError(origin));
  },
}));

const dataDir = process.env.MISSION_CONTROL_DATA_DIR || "/var/lib/ai-mission-control";
const avatarStatic = express.static(path.join(dataDir, "avatars"), {
  fallthrough: false,
  immutable: true,
  maxAge: "30d",
  dotfiles: "deny",
  index: false,
});

// Employee photos are intentionally public read-only assets. The /api prefix is
// required in production because nginx proxies /api/* to this service. Uploads
// and profile changes remain protected by the authenticated employee-factory API.
app.use("/api/employee-avatars", avatarStatic);
// Retain the original direct mount for local/dev compatibility.
app.use("/employee-avatars", avatarStatic);

// Voice recordings are base64-encoded before they reach the authenticated James
// bridge. Give only that endpoint enough room for a normal 30-second recording;
// all other JSON routes retain Express's conservative default body limit.
app.use("/api/james/message", express.json({ limit: "8mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const corsErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof CorsForbiddenError) {
    logger.warn({ origin: err.origin, method: req.method, path: req.path }, "CORS request blocked");
    res.status(err.status).json({
      error: "Forbidden",
      code: err.code,
      message: "Origin is not allowed by CORS policy",
    });
    return;
  }

  next(err);
};

app.use(corsErrorHandler);

export default app;