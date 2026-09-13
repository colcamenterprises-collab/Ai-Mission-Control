import { desc, eq } from "drizzle-orm";
import {
  approvalsTable,
  agentsTable,
  db,
  tasksTable,
  workRequestsTable,
  type WorkRequest,
} from "@workspace/db";
import { evaluateApproval, type WorkRequestState } from "./execution-policy.js";
import { transitionWorkRequest } from "./execution-runtime.js";
import {
  buildExecutionHarnessContract,
  contractFromRequirements,
  evaluateCompletionContract,
  recordHarnessEvaluation,
  withExecutionHarnessRequirements,
} from "./agentic-harness.js";

const TERMINAL_STATES = new Set<WorkRequestState>([
  "completed",
  "failed",
  "rejected",
  "cancelled",
]);

export function taskExecutionKey(taskId: number): string {
  return `task:${taskId}:primary`;
}

export async function latestTaskWorkRequest(
  taskId: number,
): Promise<WorkRequest | null> {
  const [request] = await db
    .select()
    .from(workRequestsTable)
    .where(eq(workRequestsTable.taskId, taskId))
    .orderBy(desc(workRequestsTable.updatedAt))
    .limit(1);
  return request ?? null;
}

async function ensureHarnessOnRequest(
  request: WorkRequest,
  task: typeof tasksTable.$inferSelect,
): Promise<WorkRequest> {
  if (contractFromRequirements(request.requirements)) return request;
  const contract = buildExecutionHarnessContract({
    title: task.title,
    description: task.description,
    approvalRequired: task.approvalRequired,
  });
  await db
    .update(workRequestsTable)
    .set({
      requirements: withExecutionHarnessRequirements(
        request.requirements,
        contract,
      ),
    })
    .where(eq(workRequestsTable.id, request.id));
  return (await latestTaskWorkRequest(task.id)) ?? request;
}

export async function ensureTaskWorkRequest(params: {
  task: typeof tasksTable.$inferSelect;
  agentId?: number | null;
  routingReason?: string | null;
}): Promise<WorkRequest> {
  const existing = await latestTaskWorkRequest(params.task.id);
  if (existing && !TERMINAL_STATES.has(existing.state as WorkRequestState))
    return ensureHarnessOnRequest(existing, params.task);

  const riskLevel = params.task.approvalRequired ? 3 : 0;
  const approvalDecision = evaluateApproval({
    riskLevel,
    agentCanAutoApprove: !params.task.approvalRequired,
    standingOwnerAuthority: false,
  });
  const executionKey = existing
    ? `${taskExecutionKey(params.task.id)}:${Date.now()}`
    : taskExecutionKey(params.task.id);
  const harnessContract = buildExecutionHarnessContract({
    title: params.task.title,
    description: params.task.description,
    approvalRequired: params.task.approvalRequired,
  });

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
      routingReason:
        params.routingReason ?? "Canonical Mission Control task execution",
      project: params.task.project,
      requirements: withExecutionHarnessRequirements(
        {
          source: "canonical-task",
          ownerReviewRequired: params.task.ownerReviewRequired,
          taskStatus: params.task.status,
        },
        harnessContract,
      ),
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
    if (!stored)
      throw new Error(
        `Unable to create execution request for Task #${params.task.id}`,
      );
    return ensureHarnessOnRequest(stored, params.task);
  }

  let current = await transitionWorkRequest(created, "queued", {
    type: "orchestrator",
    id: "Mission Control",
    reason: "Canonical Task entered the execution control plane",
  });
  if (!params.agentId)
    return transitionWorkRequest(current, "blocked", {
      type: "router",
      reason: "UNASSIGNED: canonical Task has no executable worker yet",
    });
  if (approvalDecision === "AUTO_EXECUTE")
    return transitionWorkRequest(current, "approved", {
      type: "policy",
      reason: "Standing delegation permits ordinary Task execution",
    });

  current = await transitionWorkRequest(current, "awaiting_approval", {
    type: "policy",
    reason: `${approvalDecision} required`,
  });
  await db
    .insert(approvalsTable)
    .values({
      requestId: current.id,
      status: "pending",
      requiredAuthority:
        approvalDecision === "OWNER_APPROVAL" ? "owner" : "orchestrator",
      reason: `Task #${params.task.id} is explicitly marked as requiring approval`,
      proposedAction: params.task.title,
    })
    .onConflictDoNothing({ target: approvalsTable.requestId });
  return current;
}

export async function authorizeOrchestratorApproval(
  taskId: number,
  decidedBy = "James Hermes",
): Promise<WorkRequest | null> {
  const request = await latestTaskWorkRequest(taskId);
  if (!request) return null;
  if (
    request.state !== "awaiting_approval" ||
    request.approvalDecision !== "ORCHESTRATOR_APPROVAL"
  )
    return request;
  await db
    .update(approvalsTable)
    .set({
      status: "approved",
      decidedBy,
      decisionNote:
        "Approved under Mission Control L2 controlled-execution standing delegation.",
      decidedAt: new Date(),
    })
    .where(eq(approvalsTable.requestId, request.id));
  return transitionWorkRequest(request, "approved", {
    type: "orchestrator",
    id: decidedBy,
    reason:
      "L2 controlled execution authorized under standing orchestrator delegation",
    context: {
      approvalDecision: request.approvalDecision,
      riskLevel: request.riskLevel,
    },
  });
}

async function advance(
  request: WorkRequest,
  to: WorkRequestState,
  reason: string,
): Promise<WorkRequest> {
  if (request.state === to) return request;
  return transitionWorkRequest(request, to, {
    type: "orchestrator",
    id: "Mission Control",
    reason,
  });
}

export async function markTaskExecutionRunning(
  taskId: number,
): Promise<WorkRequest | null> {
  let request = await latestTaskWorkRequest(taskId);
  if (!request) return null;
  if (request.state === "approved")
    request = await advance(request, "dispatched", "Worker dispatch started");
  if (request.state === "dispatched")
    request = await advance(
      request,
      "acknowledged",
      "Worker accepted dispatch",
    );
  if (request.state === "acknowledged")
    request = await advance(request, "running", "Worker execution started");
  return request;
}

export async function markTaskExecutionBlocked(
  taskId: number,
  reason: string,
): Promise<WorkRequest | null> {
  const request = await latestTaskWorkRequest(taskId);
  if (!request) return null;
  if (request.state === "running") return advance(request, "blocked", reason);
  return request;
}

export async function reopenTaskExecution(
  taskId: number,
): Promise<WorkRequest | null> {
  let request = await latestTaskWorkRequest(taskId);
  if (!request) return null;
  if (request.state === "blocked")
    request = await advance(
      request,
      "queued",
      "James resumed delegated execution after blocker review",
    );
  if (request.state === "queued" && request.approvalDecision === "AUTO_EXECUTE")
    request = await advance(
      request,
      "approved",
      "Existing standing delegation still permits execution",
    );
  return request;
}

export async function markTaskExecutionCompleted(
  taskId: number,
  result: Record<string, unknown>,
): Promise<WorkRequest | null> {
  let request = await latestTaskWorkRequest(taskId);
  if (!request) return null;
  if (
    request.state === "approved" ||
    request.state === "dispatched" ||
    request.state === "acknowledged"
  )
    request = (await markTaskExecutionRunning(taskId)) ?? request;
  if (request.state !== "running") return request;

  let contract = contractFromRequirements(request.requirements);
  if (!contract) {
    const [task] = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, taskId));
    if (!task)
      throw new Error(
        `Task #${taskId} not found while installing execution harness.`,
      );
    request = await ensureHarnessOnRequest(request, task);
    contract = contractFromRequirements(request.requirements);
  }
  if (!contract)
    throw new Error(
      `Execution harness contract missing for Task #${taskId}; completion is fail-closed.`,
    );

  let evaluationResult = result;
  if (request.agentId != null && typeof result.executedBy !== "string") {
    const [executor] = await db
      .select({ name: agentsTable.name })
      .from(agentsTable)
      .where(eq(agentsTable.id, request.agentId))
      .limit(1);
    evaluationResult = {
      ...result,
      executedBy: executor?.name?.trim() || `agent:${request.agentId}`,
    };
  }
  const evaluation = evaluateCompletionContract({
    contract,
    result: evaluationResult,
    approvalDecision: request.approvalDecision,
  });
  await recordHarnessEvaluation({
    request,
    result,
    evals: evaluation.evals,
    passed: evaluation.passed,
  });
  await db
    .update(workRequestsTable)
    .set({
      result: {
        ...result,
        agenticHarness: { passed: evaluation.passed, evals: evaluation.evals },
      },
      ownerReport: typeof result.summary === "string" ? result.summary : null,
    })
    .where(eq(workRequestsTable.id, request.id));
  if (!evaluation.passed)
    return (await latestTaskWorkRequest(taskId)) ?? request;

  const refreshed = (await latestTaskWorkRequest(taskId)) ?? request;
  return advance(
    refreshed,
    "completed",
    "Agentic harness evals passed and James independently verified the Task outcome",
  );
}
