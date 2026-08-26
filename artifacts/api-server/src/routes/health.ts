import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getOperationalReadiness } from "../services/operational-readiness.js";

const router: IRouter = Router();

// Liveness: proves the Node process can answer HTTP. Keep this intentionally cheap.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Readiness: proves Mission Control's critical operating dependencies are usable.
// This is intentionally separate from liveness so process supervisors do not
// restart a healthy Node process because a dependency is temporarily degraded.
router.get("/readyz", async (_req, res): Promise<void> => {
  const readiness = await getOperationalReadiness();
  res.status(readiness.status === "ready" ? 200 : 503).json(readiness);
});

export default router;
