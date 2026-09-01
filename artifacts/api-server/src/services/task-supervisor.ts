import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, activityTable, agentsTable, taskMessagesTable, tasksTable, workRequestsTable } from "@workspace/db";
import { dispatchRuntime, isRuntimeConfigured } from "./agent-runtime.js";
import { delegationDecision, supervisionAction } from "./autonomy-policy.js";

const SUPERVISED_STATUSES = ["backlog", "ready", "running", "in_progress", "blocked", "changes_required"];
const DEFAULT_STALE_MINUTES = 20;
const DEFAULT_MAX_ATTEMPTS = 3;

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

async function addMessage(taskId: number, author: string, body: string): Promise<void> {
  await db.insert(taskMessagesTable).values({ taskId, author, body });
  await db.update(tasksTable).set({ unreadMessages: 1 }).where(eq(tasksTable.id, taskId));
}

export type SupervisionSummary = {
  inspected: number;
  delegated: number;
  ownerEscalations: number;
  runtimeFailures: number;
  skipped: number;
};

export async function superviseActiveTasks(): Promise<SupervisionSummary> {
  const summary: SupervisionSummary = { inspected: 0, delegated: 0, ownerEscalations: 0, runtimeFailures: 0, skipped: 0 };
  const now = new Date();
  const tasks = await db.select().from(tasksTable).where(and(isNull(tasksTable.archivedAt), inArray(tasksTable.status, SUPERVISED_STATUSES)));
  summary.inspected = tasks.length;
  if (tasks.length === 0) return summary;

  const agents = await db.select().from(agentsTable);
  const james = agents.find(agent => /orchestrator/i.test(agent.role)) ?? agents.find(agent => /james/i.test(agent.name));

  for (const task of tasks) {
    if (!needsReview(task, now)) { summary.skipped += 1; continue; }

    const [latestRequest] = await db.select().from(workRequestsTable)
      .where(eq(workRequestsTable.taskId, task.id))
      .orderBy(desc(workRequestsTable.updatedAt))
      .limit(1);

    const decision = delegationDecision({
      status: task.status,
      approvalRequired: task.approvalRequired,
      riskLevel: latestRequest?.riskLevel,
      approvalDecision: latestRequest?.approvalDecision,
    });
    const action = supervisionAction(task.status);

    if (decision.authority === "OWNER") {
      const reason = decision.reason;
      await db.update(tasksTable).set({
        nextAction: action,
        nextActionOwner: "Cameron",
        ownerDecisionReason: reason,
        blocker: task.status === "blocked" ? (task.blocker ?? reason) : task.blocker,
        lastOrchestratorReviewAt: now,
        approvalRequired: true,
      }).where(eq(tasksTable.id, task.id));
      await addMessage(task.id, "Mission Control", `OWNER DECISION REQUIRED — ${reason}\nNext action: ${action}`);
      summary.ownerEscalations += 1;
      continue;
    }

    if ((task.supervisionAttempts ?? 0) >= maxAttempts()) {
      const reason = `Automatic supervision reached the ${maxAttempts()}-attempt safety limit without restoring forward progress.`;
      await db.update(tasksTable).set({
        status: "blocked",
        nextAction: "Review the repeated execution failure and decide whether to change the plan, worker or system access.",
        nextActionOwner: "Cameron",
        ownerDecisionReason: reason,
        blocker: reason,
        lastOrchestratorReviewAt: now,
        approvalRequired: true,
      }).where(eq(tasksTable.id, task.id));
      await addMessage(task.id, "Mission Control", `OWNER ATTENTION REQUIRED — ${reason}`);
      summary.ownerEscalations += 1;
      continue;
    }

    if (!james || !isRuntimeConfigured(james)) {
      const reason = "James Hermes orchestrator runtime is not currently configured or reachable for automatic supervision.";
      await db.update(tasksTable).set({
        status: "blocked",
        nextAction: "Restore James Hermes runtime availability, then resume automatic orchestration.",
        nextActionOwner: "Cameron",
        ownerDecisionReason: reason,
        blocker: reason,
        lastOrchestratorReviewAt: now,
        approvalRequired: true,
      }).where(eq(tasksTable.id, task.id));
      await addMessage(task.id, "Mission Control", `OWNER ATTENTION REQUIRED — ${reason}`);
      summary.runtimeFailures += 1;
      continue;
    }

    const attempt = (task.supervisionAttempts ?? 0) + 1;
    await db.update(tasksTable).set({
      status: "running",
      nextAction: action,
      nextActionOwner: james.name,
      ownerDecisionReason: null,
      blocker: task.status === "blocked" ? task.blocker : null,
      lastOrchestratorReviewAt: now,
      supervisionAttempts: attempt,
      approvalRequired: false,
    }).where(eq(tasksTable.id, task.id));

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
      await db.update(tasksTable).set({
        status: "blocked",
        blocker: reason,
        nextAction: "Restore orchestrator execution and resume this task.",
        nextActionOwner: "Cameron",
        ownerDecisionReason: reason,
        approvalRequired: true,
      }).where(eq(tasksTable.id, task.id));
      await addMessage(task.id, "Mission Control", `OWNER ATTENTION REQUIRED — ${reason}`);
      summary.runtimeFailures += 1;
      continue;
    }

    await addMessage(task.id, "James Hermes", `SUPERVISION — I own the next action for this task. ${action}`);
    await db.insert(activityTable).values({ agentName: james.name, action: "Automatic task supervision dispatched", detail: `Task #${task.id}; attempt ${attempt}; prior state ${task.status}`, status: "active" });
    summary.delegated += 1;
  }

  return summary;
}
