import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  approvalsTable,
  db,
  workRequestsTable,
} from "@workspace/db";
import { transitionWorkRequest } from "../services/execution-runtime.js";
import {
  ALWAYS_FORBIDDEN_OPERATIONS,
  REQUIRED_ALLOWED_OPERATIONS,
} from "./continuous-delivery.js";

const router: IRouter = Router();
const SHA_RE = /^[0-9a-f]{40}$/i;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

router.post("/continuous-delivery/prepare", async (req, res): Promise<void> => {
  const repository = clean(req.body?.repository);
  const pullRequest = Number(req.body?.pullRequest);
  const approvedHeadSha = clean(req.body?.approvedHeadSha)?.toLowerCase() ?? null;
  const maxRepairAttempts = Number(req.body?.maxRepairAttempts ?? 2);

  if (!repository || !REPO_RE.test(repository)) {
    res.status(400).json({ error: "repository must be owner/name" });
    return;
  }
  if (!Number.isInteger(pullRequest) || pullRequest <= 0) {
    res.status(400).json({ error: "pullRequest must be a positive integer" });
    return;
  }
  if (!approvedHeadSha || !SHA_RE.test(approvedHeadSha)) {
    res.status(400).json({ error: "approvedHeadSha must be an exact 40-character Git SHA" });
    return;
  }
  if (!Number.isInteger(maxRepairAttempts) || maxRepairAttempts < 0 || maxRepairAttempts > 3) {
    res.status(400).json({ error: "maxRepairAttempts must be between 0 and 3" });
    return;
  }

  const executionKey = clean(req.body?.executionKey) ?? `cd:${repository}:pr:${pullRequest}:${approvedHeadSha}`;
  const [existing] = await db.select().from(workRequestsTable).where(eq(workRequestsTable.executionKey, executionKey));
  if (existing) {
    res.status(200).json({ request: existing, duplicate: true });
    return;
  }

  const requirements = {
    continuousDelivery: {
      version: 1,
      kind: "production_delivery",
      repository,
      environment: "production",
      pullRequest,
      approvedHeadSha,
      baseBranch: "main",
      allowedOperations: [...REQUIRED_ALLOWED_OPERATIONS],
      forbiddenOperations: [...ALWAYS_FORBIDDEN_OPERATIONS],
      maxRepairAttempts,
    },
    agenticHarness: {
      completionContract: {
        summary: "Production deployment is complete only after exact-SHA verification and public/local health certification.",
        requiredEvidence: [
          "approved PR head SHA matched immediately before merge",
          "required GitHub CI check passed",
          "merged commit became exact production target",
          "local API health passed",
          "public API health passed",
          "public frontend health passed",
          "automatic rollback evidence retained for every failed deployment attempt",
        ],
      },
    },
  };

  const [created] = await db
    .insert(workRequestsTable)
    .values({
      executionKey: executionKey || randomUUID(),
      taskId: Number.isInteger(req.body?.taskId) ? req.body.taskId : null,
      agentId: null,
      requestedAction: `Merge approved PR #${pullRequest} and deliver it safely to production`,
      riskLevel: 3,
      approvalDecision: "OWNER_APPROVAL",
      state: "draft",
      business: clean(req.body?.business) ?? "Customli",
      project: clean(req.body?.project) ?? "Mission Control",
      repository,
      environment: "production",
      routingReason: "Dedicated approval-gated continuous delivery controller",
      requirements,
      maxAttempts: maxRepairAttempts + 1,
      idempotencyClass: "side_effecting",
    })
    .returning();

  const queued = await transitionWorkRequest(created, "queued", {
    type: "orchestrator",
    id: "James",
    reason: "Production delivery approval package prepared",
  });
  const awaiting = await transitionWorkRequest(queued, "awaiting_approval", {
    type: "policy",
    reason: "Production merge and deployment require explicit owner approval",
    context: { repository, pullRequest, approvedHeadSha },
  });

  const [approval] = await db
    .insert(approvalsTable)
    .values({
      requestId: awaiting.id,
      status: "pending",
      requiredAuthority: "owner",
      reason: `Approve PR #${pullRequest} at exact head ${approvedHeadSha} for production delivery`,
      proposedAction: `Merge ${repository} PR #${pullRequest}; deploy the resulting exact main SHA; verify production; automatically roll back failures; permit up to ${maxRepairAttempts} bounded code-only Codex repair attempt(s).`,
      expectedEffect: "The approved change reaches production without a manual Hostinger terminal step and is marked complete only after deterministic health certification.",
      rollbackPlan: "On any deployment or certification failure, restore the previous known-good Git SHA and restart/verify Mission Control before attempting bounded remediation.",
    })
    .returning();

  res.status(201).json({ request: awaiting, approval, duplicate: false });
});

export default router;
