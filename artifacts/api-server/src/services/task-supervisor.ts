import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, activityTable, agentsTable, taskMessagesTable, tasksTable, workRequestsTable, approvalsTable } from "@workspace/db";
import { dispatchRuntime, isRuntimeConfigured } from "./agent-runtime.js";
import { delegationDecision, supervisionAction } from "./autonomy-policy.js";
import { ensureTaskWorkRequest, reopenTaskExecution } from "./task-execution-control.js";
import { transitionWorkRequest } from "./execution-runtime.js";

const SUPERVISED_STATUSES = ["backlog", "ready", "running", "in_progress", "blocked", "changes_required"];
const DEFAULT_STALE_MINUTES = 20;
const DEFAULT_MAX_ATTEMPTS = 3;
const LEGACY_SUPERVISION_REASONS = [
  /^Automatic supervision reached the \d+-attempt safety limit/i,
  /^James Hermes orchestrator runtime is not currently configured/i,
  /^Automatic supervision could not dispatch James/i,
];
const LEGACY_SUPERVISION_MESSAGES = [
  /^OWNER ATTENTION REQUIRED — Automatic supervision reached the \d+-attempt safety limit/i,
  /^OWNER ATTENTION REQUIRED — James Hermes orchestrator runtime is not currently configured/i,
  /^OWNER ATTENTION REQUIRED — Automatic supervision could not dispatch James/i,
];
const PROVIDER_CAPACITY_PATTERNS = [
  /HTTP\s+403:\s*Key limit exceeded/i,
  /key limit exceeded \(total limit\)/i,
];

function staleMinutes(): number {
  const value = Number(process.env.MISSION_CONTROL_SUPERVISION_STALE_MINUTES ?? DEFAULT_STALE_MINUTES);
  return Number.isFinite(value) && value >= 2 ? value : DEFAULT_STALE_MINUTES;
}

function maxAttempts(): number {
  const value = Number(process.env.MISSION_CONTROL_SUPERVISION_MAX_ATTEMPTS ?? DEFAULT_MAX_ATTEMPTS);
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : DEFAULT_MAX_ATTEMPTS;
}

function needsReview(task: typeof tasksTable.$inferSelect, now: Date): boolean {
  if (task.status === "blocked" || task.status === "changes_required" || task.status === "backlog" || task.status === "ready") return true;
  const anchor = task.lastOrchestratorReviewAt ?? task.updatedAt ?? task.createdAt;
  return now.getTime() - anchor.getTime() >= staleMinutes() * 60_000;
}

function canonicalTaskRequest(request: typeof workRequestsTable.$inferSelect | null): boolean {
  const requirements = request?.requirements;
  return Boolean(requirements && typeof requirements === "object" && !Array.isArray(requirements) && (requirements as Record<string, unknown>).source === "canonical-task");
}

async function hasLegacySupervisorEvidence(task: typeof tasksTable.$inferSelect): Promise<boolean> {
  if (!task.approvalRequired) return false;
  const reason = task.ownerDecisionReason?.trim();
  if (reason && LEGACY_SUPERVISION_REASONS.some(pattern => pattern.test(reason))) return true;
  const messages = await db.select({ author: taskMessagesTable.author, body: taskMessagesTable.body })
    .from(taskMessagesTable)
    .where(eq(taskMessagesTable.taskId, task.id));
  return messages.some(message => message.author === "Mission Control" && LEGACY_SUPERVISION_MESSAGES.some(pattern => pattern.test(message.body)));
}

async function hasProviderCapacityBlocker(taskId: number): Promise<boolean> {
  const messages = await db.select({ body: taskMessagesTable.body })
    .from(taskMessagesTable)
    .where(eq(taskMessagesTable.taskId, taskId))
    .orderBy(desc(taskMessagesTable.createdAt))
    .limit(12);
  return messages.some(message => PROVIDER_CAPACITY_PATTERNS.some(pattern => pattern.test(message.body)));
}

async function repairLegacySupervisorApproval(task: typeof tasksTable.$inferSelect): Promise<typeof tasksTable.$inferSelect> {
  if (!task.approvalRequired) return task;

  const requests = await db.select().from(workRequestsTable)
    .where(eq(workRequestsTable.taskId, task.id))
    .orderBy(desc(workRequestsTable.updatedAt));

  const originalAutomaticRequest = requests.find(request =>
    canonicalTaskRequest(request)
    && request.riskLevel <= 1
    && request.approvalDecision === "AUTO_EXECUTE",
  );

  if (!originalAutomaticRequest || !(await hasLegacySupervisorEvidence(task))) return task;

  for (const request of requests) {
    if (!canonicalTaskRequest(request) || request.state !== "awaiting_approval" || request.approvalDecision !== "OWNER_APPROVAL") continue;
    await db.update(approvalsTable)
      .set({ status: "cancelled", decidedBy: "Mission Control", decisionNote: "Removed legacy supervisor-created owner gate during Ground Zero 1.6 reconciliation.", decidedAt: new Date() })
      .where(eq(approvalsTable.requestId, request.id));
    await transitionWorkRequest(request, "cancelled", {
      type: "system",
      id: "Ground Zero 1.6",
      reason: "Legacy supervisor-created owner gate reconciled from canonical Task history",
    });
  }

  await db.update(tasksTable).set({
    approvalRequired: false,
    ownerDecisionReason: null,
    nextActionOwner: null,
    supervisionAttempts: 0,
    updatedAt: new Date(),
  }).where(eq(tasksTable.id, task.id));
  await addMessage(task.id, "Mission Control", "GROUND ZERO RECONCILIATION — Removed a legacy automatic-supervision owner gate. The original canonical execution was low-risk AUTO_EXECUTE; explicit owner approvals and protected-action gates are unchanged.");

  return { ...task, approvalRequired: false, ownerDecisionReason: null, nextActionOwner: null, supervisionAttempts: 0 };
}

async function addMessage(taskId: number, author: string, body: string): Promise<void> {
  await db.insert(taskMessagesTable).values({ taskId, author, body });
  await db.update(tasksTable).set({ unreadMessages: 1 }).where(eq(tasksTable.id, taskId));
}

export type SupervisionSummary = {
  inspected: number;
  delegated: number;
  ownerEscalations: number;
  runtimeFailures: number;
  executionRequestsCreated: number;
  legacyApprovalGatesRepaired: number;
  skipped: number;
};

export async function superviseActiveTasks(): Promise<SupervisionSummary> {
  const summary: SupervisionSummary = { inspected: 0, delegated: 0, ownerEscalations: 0, runtimeFailures: 0, executionRequestsCreated: 0, legacyApprovalGatesRepaired: 0, skipped: 0 };
  const now = new Date();
  const tasks = await db.select().from(tasksTable).where(and(isNull(tasksTable.archivedAt), inArray(tasksTable.status, SUPERVISED_STATUSES)));
  summary.inspected = tasks.length;
  if (tasks.length === 0) return summary;

  const agents = await db.select().from(agentsTable);
  const james = agents.find(agent => /orchestrator/i.test(agent.role)) ?? agents.find(agent => /james/i.test(agent.name));

  for (const storedTask of tasks) {
    const task = await repairLegacySupervisorApproval(storedTask);
    if (storedTask.approvalRequired && !task.approvalRequired) summary.legacyApprovalGatesRepaired += 1;

    let [latestRequest] = await db.select().from(workRequestsTable)
      .where(eq(workRequestsTable.taskId, task.id))
      .orderBy(desc(workRequestsTable.updatedAt))
      .limit(1);

    if (!latestRequest || ["completed", "failed", "rejected", "cancelled"].includes(latestRequest.state)) {
      const assignedAgent = task.assignee && task.assignee !== "Unassigned"
        ? agents.find(agent => agent.name === task.assignee) ?? null
        : null;
      latestRequest = await ensureTaskWorkRequest({
        task,
        agentId: assignedAgent?.id ?? null,
        routingReason: assignedAgent
          ? `Backfilled from canonical Task assignment to ${assignedAgent.name}`
          : "Backfilled canonical Task pending orchestrator worker assignment",
      });
      summary.executionRequestsCreated += 1;
    }

    if (!needsReview(task, now)) { summary.skipped += 1; continue; }

    const decision = delegationDecision({
      status: task.status,
      approvalRequired: task.approvalRequired,
      riskLevel: latestRequest?.riskLevel,
      approvalDecision: latestRequest?.approvalDecision,
    });
    const action = supervisionAction(task.status);

    if (decision.authority === "OWNER") {
      const reason = decision.reason;
      const alreadyEscalated = task.nextActionOwner === "Cameron" && task.ownerDecisionReason === reason;
      await db.update(tasksTable).set({
        nextAction: action,
        nextActionOwner: "Cameron",
        ownerDecisionReason: reason,
        blocker: task.status === "blocked" ? (task.blocker ?? reason) : task.blocker,
        lastOrchestratorReviewAt: now,
      }).where(eq(tasksTable.id, task.id));
      if (!alreadyEscalated) await addMessage(task.id, "Mission Control", `OWNER DECISION REQUIRED — ${reason}\nNext action: ${action}`);
      summary.ownerEscalations += 1;
      continue;
    }

    if (await hasProviderCapacityBlocker(task.id)) {
      const reason = "OpenRouter execution is blocked because the configured key has exceeded its total limit. This is a provider credential/capacity issue, not approval for the underlying task.";
      const alreadyEscalated = task.nextActionOwner === "Cameron" && task.ownerDecisionReason === reason;
      await db.update(tasksTable).set({
        status: "blocked",
        nextAction: "Increase or replace the OpenRouter key limit, or configure another usable model provider. The task itself remains low-risk and does not require owner approval.",
        nextActionOwner: "Cameron",
        ownerDecisionReason: reason,
        blocker: reason,
        lastOrchestratorReviewAt: now,
      }).where(eq(tasksTable.id, task.id));
      if (!alreadyEscalated) await addMessage(task.id, "Mission Control", `OWNER ACTION REQUIRED — ${reason}`);
      summary.runtimeFailures += 1;
      continue;
    }

    if ((task.supervisionAttempts ?? 0) >= maxAttempts()) {
      const reason = `Automatic supervision reached the ${maxAttempts()}-attempt safety limit without restoring forward progress.`;
      await db.update(tasksTable).set({
        status: "blocked",
        nextAction: "James must change the delegated recovery plan, worker, evidence source or access path before another execution cycle.",
        nextActionOwner: "James Hermes",
        ownerDecisionReason: null,
        blocker: reason,
        lastOrchestratorReviewAt: now,
        supervisionAttempts: 0,
      }).where(eq(tasksTable.id, task.id));
      await addMessage(task.id, "Mission Control", `QA RECOVERY CYCLE STARTED — ${reason} This remains inside orchestrator authority; James must change the recovery plan before retrying.`);
      summary.skipped += 1;
      continue;
    }

    if (!james || !isRuntimeConfigured(james)) {
      const reason = "James Hermes orchestrator runtime is not currently configured or reachable for automatic supervision.";
      const alreadyEscalated = task.nextActionOwner === "Cameron" && task.ownerDecisionReason === reason;
      await db.update(tasksTable).set({
        status: "blocked",
        nextAction: "Restore James Hermes runtime availability, then resume automatic orchestration.",
        nextActionOwner: "Cameron",
        ownerDecisionReason: reason,
        blocker: reason,
        lastOrchestratorReviewAt: now,
      }).where(eq(tasksTable.id, task.id));
      if (!alreadyEscalated) await addMessage(task.id, "Mission Control", `OWNER ACTION REQUIRED — ${reason}`);
      summary.runtimeFailures += 1;
      continue;
    }

    await reopenTaskExecution(task.id);
    const attempt = (task.supervisionAttempts ?? 0) + 1;
    await db.update(tasksTable).set({
      status: "running",
      nextAction: action,
      nextActionOwner: james.name,
      ownerDecisionReason: null,
      blocker: task.status === "blocked" ? task.blocker : null,
      lastOrchestratorReviewAt: now,
      supervisionAttempts: attempt,
    }).where(eq(tasksTable.id, task.id));

    if (task.status === "blocked") {
      await addMessage(task.id, "Mission Control", `QA RECOVERY CYCLE STARTED — James owns delegated recovery attempt ${attempt}.`);
    }

    const instructions = [
      `MISSION CONTROL ACTIVE TASK SUPERVISION — Task #${task.id}: ${task.title}`,
      `Current state before supervision: ${task.status}`,
      `Standing delegation: ${decision.reason}`,
      `Required next action: ${action}`,
      "",
      "You are the orchestrator and own forward progress. Do not ask the owner to decide matters inside your standing delegation.",
      "Inspect the task brief, recent task history, available systems, worker state and evidence. Resolve ordinary blockers yourself, change the execution plan, reassign/retry workers, or request precise worker rework as needed.",
      "Escalate to the owner only for a protected action, risk level 3-4, explicit owner judgement, missing owner-only credential/access, or after reasonable delegated recovery is exhausted.",
      "A task may not be left idle: it must have active execution, a named next action, or a factual owner-authority requirement.",
      "Continue the task rather than merely describing what should happen next.",
      "",
      "ORIGINAL OWNER BRIEF:",
      task.description ?? "",
    ].join("\n");

    const dispatch = await dispatchRuntime(james, { mode: "work", instructions, taskId: task.id, context: JSON.stringify({ source: "continuous-task-supervisor", attempt, previousStatus: task.status }) });
    if (!dispatch.ok) {
      const reason = `Automatic supervision could not dispatch James: ${dispatch.error ?? "runtime dispatch failed"}`;
      const alreadyEscalated = task.nextActionOwner === "Cameron" && task.ownerDecisionReason === reason;
      await db.update(tasksTable).set({
        status: "blocked",
        blocker: reason,
        nextAction: "Restore orchestrator execution and resume this task.",
        nextActionOwner: "Cameron",
        ownerDecisionReason: reason,
      }).where(eq(tasksTable.id, task.id));
      if (!alreadyEscalated) await addMessage(task.id, "Mission Control", `OWNER ACTION REQUIRED — ${reason}`);
      summary.runtimeFailures += 1;
      continue;
    }

    await addMessage(task.id, "James Hermes", `SUPERVISION — I own the next action for this task. ${action}`);
    await db.insert(activityTable).values({ agentName: james.name, action: "Automatic task supervision dispatched", detail: `Task #${task.id}; attempt ${attempt}; prior state ${task.status}`, status: "active" });
    summary.delegated += 1;
  }

  return summary;
}
