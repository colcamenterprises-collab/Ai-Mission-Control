import { desc, eq } from "drizzle-orm";
import {
  approvalsTable,
  db,
  tasksTable,
  workRequestsTable,
  type WorkRequest,
} from "@workspace/db";
import { evaluateApproval, type WorkRequestState } from "./execution-policy.js";
import { transitionWorkRequest } from "./execution-runtime.js";

const TERMINAL_STATES = new Set<WorkRequestState>([
  "completed",
  "failed",
  "rejected",
  "cancelled",
]);

export function taskExecutionKey(taskId: number): string {
  return `task:${taskId}:primary`;
}

export async function latestTaskWorkRequest(taskId: number): Promise<WorkRequest | null> {
  const [request] = await db
    .select()
    .from(workRequestsTable)
    .where(eq(workRequestsTable.taskId, taskId))
    .orderBy(desc(workRequestsTable.updatedAt))
    .limit(1);
  return request ?? null;
}

export async function ensureTaskWorkRequest(params: {
  task: typeof tasksTable.$inferSelect;
  agentId?: number | null;
  routingReason?: string | null;
}): Promise<WorkRequest> {
  const existing = await latestTaskWorkRequest(params.task.id);
  if (existing && !TERMINAL_STATES.has(existing.state as WorkRequestState)) return existing;

  const riskLevel = params.task.approvalRequired ? 3 : 0;
  const approvalDecision = evaluateApproval({
    riskLevel,
    agentCanAutoApprove: !params.task.approvalRequired,
    standingOwnerAuthority: false,
  });
  const executionKey = existing
    ? `${taskExecutionKey(params.task.id)}:${Date.now()}`
    : taskExecutionKey(params.task.id);

  const [created] = await db
    .insert(workRequestsTable)
    .values({
      executionKey,
      taskId: params.task.id,
      agentId: params.agentId ?? null,
      requestedAction: params.task.title,
      state: "draft",
      riskLevel,
      approvalDecision,
      routingReason: params.routingReason ?? "Canonical Mission Control task execution",
      project: params.task.project,
      requirements: {
        source: "canonical-task",
        ownerReviewRequired: params.task.ownerReviewRequired,
        taskStatus: params.task.status,
      },
      maxAttempts: 3,
      idempotencyClass: "side_effecting",
    })
    .onConflictDoNothing({ target: workRequestsTable.executionKey })
    .returning();

  if (!created) {
    const [stored] = await db
      .select()
      .from(workRequestsTable)
      .where(eq(workRequestsTable.executionKey, executionKey));
    if (!stored) throw new Error(`Unable to create execution request for Task #${params.task.id}`);
    return stored;
  }

  let current = await transitionWorkRequest(created, "queued", {
    type: "orchestrator",
    id: "Mission Control",
    reason: "Canonical Task entered the execution control plane",
  });

  if (!params.agentId) {
    return transitionWorkRequest(current, "blocked", {
      type: "router",
      reason: "UNASSIGNED: canonical Task has no executable worker yet",
    });
  }

  if (approvalDecision === "AUTO_EXECUTE") {
    return transitionWorkRequest(current, "approved", {
      type: "policy",
      reason: "Standing delegation permits ordinary Task execution",
    });
  }

  current = await transitionWorkRequest(current, "awaiting_approval", {
    type: "policy",
    reason: `${approvalDecision} required`,
  });
  await db
    .insert(approvalsTable)
    .values({
      requestId: current.id,
      status: "pending",
      requiredAuthority: approvalDecision === "OWNER_APPROVAL" ? "owner" : "orchestrator",
      reason: `Task #${params.task.id} is explicitly marked as requiring approval`,
      proposedAction: params.task.title,
    })
    .onConflictDoNothing({ target: approvalsTable.requestId });
  return current;
}

async function advance(request: WorkRequest, to: WorkRequestState, reason: string): Promise<WorkRequest> {
  if (request.state === to) return request;
  return transitionWorkRequest(request, to, {
    type: "orchestrator",
    id: "Mission Control",
    reason,
  });
}

export async function markTaskExecutionRunning(taskId: number): Promise<WorkRequest | null> {
  let request = await latestTaskWorkRequest(taskId);
  if (!request) return null;
  if (request.state === "approved") request = await advance(request, "dispatched", "Worker dispatch started");
  if (request.state === "dispatched") request = await advance(request, "acknowledged", "Worker accepted dispatch");
  if (request.state === "acknowledged") request = await advance(request, "running", "Worker execution started");
  return request;
}

export async function markTaskExecutionBlocked(taskId: number, reason: string): Promise<WorkRequest | null> {
  const request = await latestTaskWorkRequest(taskId);
  if (!request) return null;
  if (request.state === "running") return advance(request, "blocked", reason);
  return request;
}

export async function reopenTaskExecution(taskId: number): Promise<WorkRequest | null> {
  let request = await latestTaskWorkRequest(taskId);
  if (!request) return null;
  if (request.state === "blocked") request = await advance(request, "queued", "James resumed delegated execution after blocker review");
  if (request.state === "queued" && request.approvalDecision === "AUTO_EXECUTE") request = await advance(request, "approved", "Existing standing delegation still permits execution");
  return request;
}

export async function markTaskExecutionCompleted(
  taskId: number,
  result: Record<string, unknown>,
): Promise<WorkRequest | null> {
  let request = await latestTaskWorkRequest(taskId);
  if (!request) return null;
  if (request.state === "approved" || request.state === "dispatched" || request.state === "acknowledged") {
    request = (await markTaskExecutionRunning(taskId)) ?? request;
  }
  if (request.state !== "running") return request;
  await db
    .update(workRequestsTable)
    .set({ result, ownerReport: typeof result.summary === "string" ? result.summary : null })
    .where(eq(workRequestsTable.id, request.id));
  const refreshed = (await latestTaskWorkRequest(taskId)) ?? request;
  return advance(refreshed, "completed", "James independently verified the Task outcome");
}
