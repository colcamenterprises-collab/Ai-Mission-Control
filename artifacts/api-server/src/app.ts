import express, { type Express } from "express";
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
const allowedOrigins = allowedOriginsRaw
  ? allowedOriginsRaw.split(",").map(o => o.trim()).filter(Boolean)
  : (isProd ? [] : ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"]);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const isAllowed = allowedOrigins.includes(origin) || (!isProd && origin.includes("replit.dev"));
    if (isAllowed) return cb(null, true);
    return cb(new Error("CORS blocked"));
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
