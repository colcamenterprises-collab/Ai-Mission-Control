import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tasksTable, taskMessagesTable, agentCommandsTable, activityTable } from "@workspace/db";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();
const STATE_DIR = "/var/lib/ai-mission-control/james-jobs";
const RUNNER = "/opt/apps/ai-mission-control/scripts/run-james-task-job.sh";

router.post("/james/task-job", async (req, res): Promise<void> => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const taskId = Number(req.body?.taskId);
  const commandId = req.body?.commandId == null ? null : Number(req.body.commandId);
  if (!message || !Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: "message and valid taskId are required" });
    return;
  }

  const jobId = crypto.randomUUID();
  const safeJobId = jobId.replace(/[^a-zA-Z0-9-]/g, "");
  const promptFile = `${STATE_DIR}/${safeJobId}.prompt`;
  const unit = `james-task-${safeJobId}`;

  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(promptFile, message, { encoding: "utf8", mode: 0o600 });

  try {
    await execFileAsync("systemd-run", [
      `--unit=${unit}`,
      "--collect",
      "--no-block",
      "/bin/bash",
      RUNNER,
      safeJobId,
      String(taskId),
      commandId ? String(commandId) : "",
      promptFile,
    ], { timeout: 15_000, windowsHide: true });
  } catch (error) {
    await db.insert(taskMessagesTable).values({
      taskId,
      author: "Mission Control",
      body: `BLOCKED — James detached worker could not be launched: ${error instanceof Error ? error.message : "unknown error"}`,
    });
    await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, taskId));
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

router.post("/james/report", async (req, res): Promise<void> => {
  const taskId = Number(req.body?.taskId);
  const commandId = req.body?.commandId == null ? null : Number(req.body.commandId);
  const status = typeof req.body?.status === "string" ? req.body.status : "failed";
  const output = typeof req.body?.output === "string" ? req.body.output.trim() : "";
  const error = typeof req.body?.error === "string" ? req.body.error.trim() : "";
  const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : "unknown";

  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: "valid taskId is required" });
    return;
  }

  const completed = status === "completed";
  const body = completed
    ? (output || `James completed detached job ${jobId}.`)
    : `BLOCKED — James detached job ${jobId} failed.${error ? ` ${error}` : ""}${output ? `\n\n${output}` : ""}`;

  await db.insert(taskMessagesTable).values({ taskId, author: "James Hermes", body });
  await db.update(tasksTable)
    .set({ status: completed ? "review" : "blocked", unreadMessages: 1 })
    .where(eq(tasksTable.id, taskId));

  if (commandId && Number.isInteger(commandId)) {
    await db.update(agentCommandsTable)
      .set({ acknowledgedAt: new Date(), deliveredViaHttp: completed })
      .where(eq(agentCommandsTable.id, commandId));
  }

  await db.insert(activityTable).values({
    agentName: "James Hermes",
    action: completed ? "Detached worker completed task" : "Detached worker failed task",
    detail: `Task #${taskId}; job ${jobId}`,
    status: completed ? "pending" : "error",
  });

  await db.insert(taskMessagesTable).values({
    taskId,
    author: "Mission Control",
    body: completed
      ? "WORK COMPLETE — orchestrator review recorded. Owner final sign-off is required before this task is archived."
      : "FOLLOW-UP REQUIRED — the task remains blocked until the execution failure is resolved.",
  });

  res.json({ accepted: true, taskId, status: completed ? "review" : "blocked" });
});

export default router;
