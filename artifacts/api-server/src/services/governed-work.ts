import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  approvalsTable,
  db,
  workRequestsTable,
  type WorkRequest,
} from "@workspace/db";
import { evaluateApproval, redactSensitive } from "./execution-policy.js";
import { evaluateAgentEligibility } from "./execution-permissions.js";
import { transitionWorkRequest } from "./execution-runtime.js";

type GovernedWorkInput = {
  taskId: number;
  agentId: number | null;
  requestedAction: string;
  project?: string | null;
  business?: string | null;
  routingReason?: string | null;
  requirements?: Record<string, unknown>;
  riskLevel?: number;
  approvalReason?: string | null;
  expectedEffect?: string | null;
  rollbackPlan?: string | null;
  executionKey?: string | null;
  actor?: string;
};

export async function createGovernedWorkRequest(input: GovernedWorkInput): Promise<WorkRequest> {
  const riskLevel = input.riskLevel ?? 1;
  const decision = evaluateApproval({ riskLevel });
  const executionKey = input.executionKey ?? randomUUID();
  const eligibility = input.agentId
    ? await evaluateAgentEligibility(input.agentId, input.requirements ?? {})
    : null;

  const [created] = await db
    .insert(workRequestsTable)
    .values({
      executionKey,
      taskId: input.taskId,
      agentId: input.agentId,
      requestedAction: input.requestedAction,
      riskLevel,
      approvalDecision: decision,
      state: "draft",
      business: input.business ?? null,
      project: input.project ?? null,
      routingReason: input.routingReason ?? null,
      requirements: redactSensitive(input.requirements ?? {}) as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: workRequestsTable.executionKey })
    .returning();

  if (!created) {
    const [existing] = await db
      .select()
      .from(workRequestsTable)
      .where(eq(workRequestsTable.executionKey, executionKey));
    if (!existing) throw new Error("Unable to resolve governed work request");
    return existing;
  }

  let current = await transitionWorkRequest(created, "queued", {
    type: "owner",
    id: input.actor ?? "Cameron",
    reason: "Actionable work accepted by canonical intake",
  });

  if (!input.agentId) {
    return transitionWorkRequest(current, "blocked", {
      type: "router",
      reason: "UNASSIGNED: no eligible worker was selected",
    });
  }
  if (eligibility && !eligibility.eligible) {
    return transitionWorkRequest(current, "blocked", {
      type: "policy",
      reason: `${eligibility.code}: ${eligibility.missing.join(", ")}`,
    });
  }
  if (decision === "DENIED") {
    return transitionWorkRequest(current, "blocked", {
      type: "policy",
      reason: "Policy prohibits execution",
    });
  }
  if (decision === "AUTO_EXECUTE") {
    return transitionWorkRequest(current, "approved", {
      type: "policy",
      reason: "Risk policy permits automatic execution",
    });
  }

  current = await transitionWorkRequest(current, "awaiting_approval", {
    type: "policy",
    reason: `${decision} required`,
  });
  await db.insert(approvalsTable).values({
    requestId: current.id,
    status: "pending",
    requiredAuthority: decision === "OWNER_APPROVAL" ? "owner" : "orchestrator",
    reason: input.approvalReason ?? `Risk level ${riskLevel} requires approval`,
    proposedAction: input.requestedAction,
    expectedEffect: input.expectedEffect ?? null,
    rollbackPlan: input.rollbackPlan ?? null,
  });
  return current;
}
