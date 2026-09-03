import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, tasksTable, taskMessagesTable, agentCommandsTable, activityTable } from "@workspace/db";
import { queueJamesCompletionReview } from "../services/worker-supervision.js";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();
const STATE_DIR = "/var/lib/ai-mission-control/james-jobs";
const RUNNER = "/opt/apps/ai-mission-control/scripts/run-james-task-job.sh";
const INBOX_RUNNER = "/opt/apps/ai-mission-control/scripts/run-james-inbox-review.sh";
const PROVIDER_CAPACITY_PATTERNS = [
  /HTTP\s+403:\s*Key limit exceeded/i,
  /key limit exceeded \(total limit\)/i,
];
const PROVIDER_CAPACITY_REASON = "OpenRouter execution is blocked because the configured key has exceeded its total limit. This is a provider credential/capacity issue, not approval for the underlying task.";
const PROVIDER_CAPACITY_ACTION = "Increase or replace the OpenRouter key limit, or configure another usable model provider. The task itself remains low-risk and does not require owner approval.";

type WorkerResult = "COMPLETED" | "IN_PROGRESS" | "CHANGES_REQUIRED" | "BLOCKED" | "FAILED" | "NEEDS_CLARIFICATION";

function clamp(value: string | null | undefined, max: number): string {
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, max)}\n...[truncated by Mission Control]`;
}

function normalizeResult(value: unknown, exitCode: number): WorkerResult {
  if (exitCode !== 0) return "FAILED";
  const candidate = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (["COMPLETED", "IN_PROGRESS", "CHANGES_REQUIRED", "BLOCKED", "FAILED", "NEEDS_CLARIFICATION"].includes(candidate)) {
    return candidate as WorkerResult;
  }
  return "IN_PROGRESS";
}

function dbStateFor(result: WorkerResult): string {
  if (result === "COMPLETED") return "completion_pending";
  if (result === "BLOCKED" || result === "FAILED" || result === "NEEDS_CLARIFICATION") return "blocked";
  return "running";
}

function missionControlNote(result: WorkerResult): string {
  switch (result) {
    case "COMPLETED":
      return "AGENT REPORTED COMPLETE — completion evidence received. A fresh supervisory verification pass is required before Review or Done.";
    case "CHANGES_REQUIRED":
      return "CHANGES REQUIRED — the task remains active. James must continue the correction cycle; owner approval is not required.";
    case "BLOCKED":
      return "BLOCKED — the task remains blocked. Missing credentials or configuration require owner action, not Approve/Reject controls. Approval is required only when the execution policy identifies a protected action.";
    case "FAILED":
      return "EXECUTION FAILED — the task is not complete. Diagnose/retry the execution failure; do not request owner acceptance.";
    case "NEEDS_CLARIFICATION":
      return "WAITING ON JAMES — clarification is required within orchestration. This is not task completion or owner acceptance.";
    default:
      return "IN PROGRESS — James reported incomplete work. The task remains active and must not be presented for final owner acceptance.";
  }
}

function isProviderCapacityFailure(...values: string[]): boolean {
  return values.some(value => PROVIDER_CAPACITY_PATTERNS.some(pattern => pattern.test(value)));
}

router.post("/james/task-job", async (req, res): Promise<void> => {
  const incomingInstruction = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const taskId = Number(req.body?.taskId);
  const commandId = req.body?.commandId == null ? null : Number(req.body.commandId);
  if (!incomingInstruction || !Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: "message and valid taskId are required" });
    return;
  }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const history = await db.select().from(taskMessagesTable)
    .where(eq(taskMessagesTable.taskId, taskId))
    .orderBy(asc(taskMessagesTable.createdAt));
  const recentHistory = history.slice(-10).map(item => `${item.author}: ${clamp(item.body, 1600)}`).join("\n\n");

  const compactPrompt = [
    `Mission Control task #${task.id}: ${task.title}`,
    `Project: ${task.project}`,
    "",
    "AUTHORITATIVE ORIGINAL OWNER BRIEF:",
    clamp(task.description, 28000),
    "",
    "LATEST EXECUTION INSTRUCTION:",
    clamp(incomingInstruction, 12000),
    "",
    "RELEVANT RECENT TASK HISTORY:",
    recentHistory || "No prior task history.",
    "",
    "OPERATING RULES:",
    "- The original Owner Brief remains authoritative on every retry and continuation.",
    "- Do not ask Cameron to restate requirements already present above.",
    "- Continue until the success milestone is genuinely achieved or a real blocker exists.",
    "- A successful command/build/process exit is evidence only; it is not task completion.",
    "- If incomplete, report IN_PROGRESS or CHANGES_REQUIRED rather than COMPLETED.",
    "- If blocked, state the exact blocker and whether owner action is genuinely required.",
    "- Keep evidence concise: files, branch/commit/PR, tests, logs, and outstanding work.",
  ].join("\n");

  const jobId = crypto.randomUUID();
  const safeJobId = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  const promptFile = `${STATE_DIR}/${safeJobId}.prompt`;
  const unit = `james-task-${safeJobId}`;
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(promptFile, compactPrompt, { encoding: "utf8", mode: 0o600 });

  try {
    await execFileAsync("systemd-run", [
      `--unit=${unit}`, "--collect", "--no-block", "/bin/bash", RUNNER,
      safeJobId, String(taskId), commandId ? String(commandId) : "", promptFile,
    ], { timeout: 15_000, windowsHide: true });
  } catch (error) {
    await db.insert(taskMessagesTable).values({
      taskId,
      author: "Mission Control",
      body: `BLOCKED — James detached worker could not be launched: ${error instanceof Error ? error.message : "unknown error"}`,
    });
    await db.update(tasksTable).set({ status: "blocked", approvalRequired: false }).where(eq(tasksTable.id, taskId));
    res.status(502).json({ error: "James detached worker launch failed" });
    return;
  }

  await db.insert(taskMessagesTable).values({
    taskId,
    author: "James Hermes",
    body: `Detached execution started. Job ${safeJobId}. Work will continue independently of Mission Control API restarts.`,
  });
  res.status(202).json({ jobId: safeJobId, status: "queued", delivery: "detached-systemd" });
});

router.post("/james/inbox-review", async (_req, res): Promise<void> => {
  const jobId = crypto.randomUUID().replace(/[^a-zA-Z0-9-]/g, "");
  try {
    await execFileAsync("systemd-run", [
      `--unit=james-inbox-${jobId}`, "--collect", "--no-block", "/bin/bash", INBOX_RUNNER, jobId,
    ], { timeout: 15_000, windowsHide: true });
  } catch (error) {
    res.status(502).json({ error: `James Inbox review could not be launched: ${error instanceof Error ? error.message : "unknown error"}` });
    return;
  }
  res.status(202).json({ jobId, status: "queued", delivery: "detached-systemd" });
});

router.post("/james/report", async (req, res): Promise<void> => {
  const taskId = Number(req.body?.taskId);
  const commandId = req.body?.commandId == null ? null : Number(req.body.commandId);
  const exitCode = Number.isFinite(Number(req.body?.exitCode)) ? Number(req.body.exitCode) : 1;
  const normalizedResult = normalizeResult(req.body?.resultState, exitCode);
  const output = typeof req.body?.output === "string" ? req.body.output.trim() : "";
  const error = typeof req.body?.error === "string" ? req.body.error.trim() : "";
  const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : "unknown";
  const worktree = typeof req.body?.worktree === "string" ? req.body.worktree : "";

  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: "valid taskId is required" });
    return;
  }

  const providerCapacityFailure = isProviderCapacityFailure(output, error);
  const result: WorkerResult = providerCapacityFailure ? "BLOCKED" : normalizedResult;
  const body = providerCapacityFailure
    ? `PROVIDER CAPACITY BLOCKER — ${PROVIDER_CAPACITY_REASON}`
    : output || (result === "FAILED"
      ? `FAILED — James detached job ${jobId} exited with code ${exitCode}.${error ? ` ${error}` : ""}`
      : `${result} — James detached job ${jobId} returned without narrative output.`);

  await db.insert(taskMessagesTable).values({ taskId, author: "James Hermes", body });

  await db.update(tasksTable)
    .set(providerCapacityFailure ? {
      status: "blocked",
      approvalRequired: false,
      ownerReviewRequired: false,
      nextAction: PROVIDER_CAPACITY_ACTION,
      nextActionOwner: "Cameron",
      ownerDecisionReason: PROVIDER_CAPACITY_REASON,
      blocker: PROVIDER_CAPACITY_REASON,
      lastOrchestratorReviewAt: new Date(),
      unreadMessages: 1,
    } : {
      status: dbStateFor(result),
      approvalRequired: false,
      unreadMessages: 1,
    })
    .where(eq(tasksTable.id, taskId));

  if (commandId && Number.isInteger(commandId)) {
    await db.update(agentCommandsTable)
      .set({ acknowledgedAt: new Date(), deliveredViaHttp: exitCode === 0 && !providerCapacityFailure })
      .where(eq(agentCommandsTable.id, commandId));
  }

  await db.insert(activityTable).values({
    agentName: "James Hermes",
    action: providerCapacityFailure ? "Provider capacity blocker" : `Detached worker result: ${result}`,
    detail: `Task #${taskId}; job ${jobId}; exit ${exitCode}${worktree ? `; workspace ${worktree}` : ""}`,
    status: result === "FAILED" || result === "BLOCKED" ? "error" : result === "COMPLETED" ? "pending" : "active",
  });

  await db.insert(taskMessagesTable).values({
    taskId,
    author: "Mission Control",
    body: providerCapacityFailure
      ? `OWNER ACTION REQUIRED — ${PROVIDER_CAPACITY_REASON}\nNext action: ${PROVIDER_CAPACITY_ACTION}\nNo Approve/Reject decision is required for Task #${taskId}.`
      : missionControlNote(result),
  });

  if (result === "COMPLETED") {
    await queueJamesCompletionReview(taskId, "James Hermes", body);
  }

  res.json({
    accepted: true,
    taskId,
    result,
    status: dbStateFor(result),
    ownerApprovalRequired: false,
    blockerType: providerCapacityFailure ? "provider_capacity" : null,
  });
});

export default router;
