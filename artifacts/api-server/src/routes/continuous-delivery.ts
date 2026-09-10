import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  approvalsTable,
  db,
  workRequestsTable,
  type WorkRequest,
} from "@workspace/db";
import { transitionWorkRequest } from "../services/execution-runtime.js";
import { redactSensitive } from "../services/execution-policy.js";

const router: IRouter = Router();

const SHA_RE = /^[0-9a-f]{40}$/i;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REQUIRED_ALLOWED_OPERATIONS = [
  "merge_approved_pr",
  "deploy_exact_commit",
  "install_locked_dependencies",
  "additive_schema_check",
  "production_build",
  "restart_mission_control_services",
  "health_checks",
  "inspect_application_logs",
  "rollback_last_known_good",
  "bounded_code_repair",
  "create_repair_pr",
  "merge_green_repair_pr",
] as const;
const ALWAYS_FORBIDDEN_OPERATIONS = [
  "destructive_database_change",
  "delete_production_data",
  "credential_or_secret_change",
  "dns_change",
  "firewall_change",
  "unrelated_nginx_change",
  "cross_repository_change",
  "production_hot_patch",
] as const;

type DeliveryEnvelope = {
  version: 1;
  kind: "production_delivery";
  repository: string;
  environment: "production";
  pullRequest: number;
  approvedHeadSha: string;
  baseBranch: "main";
  allowedOperations: string[];
  forbiddenOperations: string[];
  maxRepairAttempts: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseDeliveryEnvelope(request: WorkRequest): DeliveryEnvelope {
  if (!isRecord(request.requirements)) throw new Error("Execution requirements are missing");
  const raw = request.requirements.continuousDelivery;
  if (!isRecord(raw)) throw new Error("continuousDelivery approval envelope is missing");

  const repository = typeof raw.repository === "string" ? raw.repository.trim() : "";
  const environment = raw.environment;
  const pullRequest = Number(raw.pullRequest);
  const approvedHeadSha = typeof raw.approvedHeadSha === "string" ? raw.approvedHeadSha.trim() : "";
  const baseBranch = raw.baseBranch;
  const maxRepairAttempts = Number(raw.maxRepairAttempts ?? 2);
  const allowedOperations = Array.isArray(raw.allowedOperations)
    ? raw.allowedOperations.filter((item): item is string => typeof item === "string")
    : [];
  const forbiddenOperations = Array.isArray(raw.forbiddenOperations)
    ? raw.forbiddenOperations.filter((item): item is string => typeof item === "string")
    : [];

  if (raw.version !== 1 || raw.kind !== "production_delivery") {
    throw new Error("Unsupported continuousDelivery approval envelope");
  }
  if (!REPO_RE.test(repository) || repository !== request.repository) {
    throw new Error("Approval envelope repository does not match the execution repository");
  }
  if (environment !== "production" || request.environment !== "production") {
    throw new Error("Continuous delivery is restricted to an explicit production execution");
  }
  if (!Number.isInteger(pullRequest) || pullRequest <= 0) {
    throw new Error("Approval envelope pullRequest must be a positive integer");
  }
  if (!SHA_RE.test(approvedHeadSha)) {
    throw new Error("Approval envelope approvedHeadSha must be an exact 40-character Git SHA");
  }
  if (baseBranch !== "main") {
    throw new Error("Production delivery baseBranch must be main");
  }
  if (!Number.isInteger(maxRepairAttempts) || maxRepairAttempts < 0 || maxRepairAttempts > 3) {
    throw new Error("maxRepairAttempts must be between 0 and 3");
  }
  for (const operation of REQUIRED_ALLOWED_OPERATIONS) {
    if (!allowedOperations.includes(operation)) {
      throw new Error(`Approval envelope is missing allowed operation: ${operation}`);
    }
  }
  for (const operation of ALWAYS_FORBIDDEN_OPERATIONS) {
    if (!forbiddenOperations.includes(operation)) {
      throw new Error(`Approval envelope is missing forbidden operation: ${operation}`);
    }
  }

  return {
    version: 1,
    kind: "production_delivery",
    repository,
    environment: "production",
    pullRequest,
    approvedHeadSha: approvedHeadSha.toLowerCase(),
    baseBranch: "main",
    allowedOperations,
    forbiddenOperations,
    maxRepairAttempts,
  };
}

async function requireApprovedOwnerEnvelope(id: number) {
  const [request] = await db.select().from(workRequestsTable).where(eq(workRequestsTable.id, id));
  if (!request) throw Object.assign(new Error("Execution not found"), { status: 404 });
  if (request.state !== "approved") {
    throw Object.assign(new Error("Execution is not in approved state"), { status: 409 });
  }
  if (request.approvalDecision !== "OWNER_APPROVAL" || request.riskLevel < 3) {
    throw Object.assign(new Error("Production delivery requires explicit owner approval at risk level 3"), { status: 403 });
  }
  const [approval] = await db
    .select()
    .from(approvalsTable)
    .where(and(eq(approvalsTable.requestId, id), eq(approvalsTable.status, "approved")));
  if (!approval || approval.requiredAuthority !== "owner" || !approval.decidedAt) {
    throw Object.assign(new Error("A completed owner approval is required"), { status: 403 });
  }
  const envelope = parseDeliveryEnvelope(request);
  return { request, approval, envelope };
}

router.post("/continuous-delivery/claim/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid execution id" });
    return;
  }
  try {
    const { request, approval, envelope } = await requireApprovedOwnerEnvelope(id);
    const dispatched = await transitionWorkRequest(request, "dispatched", {
      type: "delivery_controller",
      id: "production",
      reason: `Approved production delivery claimed for PR #${envelope.pullRequest}`,
      context: {
        repository: envelope.repository,
        pullRequest: envelope.pullRequest,
        approvedHeadSha: envelope.approvedHeadSha,
      },
    });
    const acknowledged = await transitionWorkRequest(dispatched, "acknowledged", {
      type: "delivery_controller",
      id: "production",
      reason: "Production delivery controller acknowledged execution",
    });
    const running = await transitionWorkRequest(acknowledged, "running", {
      type: "delivery_controller",
      id: "production",
      reason: "Production delivery started",
    });
    res.json({
      execution: {
        id: running.id,
        executionKey: running.executionKey,
        state: running.state,
      },
      approval: {
        id: approval.id,
        decidedAt: approval.decidedAt,
        decidedBy: approval.decidedBy,
      },
      envelope,
    });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 409);
    res.status(status).json({ error: error instanceof Error ? error.message : "Continuous delivery claim failed" });
  }
});

router.post("/continuous-delivery/report/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid execution id" });
    return;
  }
  const [request] = await db.select().from(workRequestsTable).where(eq(workRequestsTable.id, id));
  if (!request) {
    res.status(404).json({ error: "Execution not found" });
    return;
  }
  if (request.state !== "running") {
    res.status(409).json({ error: "Execution is not running" });
    return;
  }

  const outcome = req.body?.outcome === "success" ? "success" : req.body?.outcome === "failure" ? "failure" : null;
  if (!outcome) {
    res.status(400).json({ error: "outcome must be success or failure" });
    return;
  }
  const safeResult = redactSensitive(req.body?.result ?? {}) as Record<string, unknown>;
  const summary = typeof req.body?.summary === "string" ? req.body.summary.slice(0, 4000) : null;
  const errorText = outcome === "failure" && typeof req.body?.error === "string" ? req.body.error.slice(0, 4000) : null;

  const [persisted] = await db
    .update(workRequestsTable)
    .set({
      result: safeResult,
      ownerReport: summary,
      error: errorText,
      progress: {
        phase: outcome === "success" ? "certified" : "failed",
        updatedAt: new Date().toISOString(),
      },
      lastProgressAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(workRequestsTable.id, id), eq(workRequestsTable.state, "running")))
    .returning();
  if (!persisted) {
    res.status(409).json({ error: "Execution changed concurrently" });
    return;
  }

  const final = await transitionWorkRequest(persisted, outcome === "success" ? "completed" : "failed", {
    type: "delivery_controller",
    id: "production",
    reason: summary ?? (outcome === "success" ? "Production delivery certified" : "Production delivery failed"),
    context: safeResult,
  });
  res.json({ execution: final });
});

export {
  ALWAYS_FORBIDDEN_OPERATIONS,
  REQUIRED_ALLOWED_OPERATIONS,
  parseDeliveryEnvelope,
};
export default router;
