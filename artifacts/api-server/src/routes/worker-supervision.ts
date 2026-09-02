import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, tasksTable, taskMessagesTable, agentsTable, agentCommandsTable, activityTable } from "@workspace/db";
import { dispatchRuntime, isRuntimeConfigured } from "../services/agent-runtime.js";
import { routeVerifiedCompletion } from "../services/task-completion-policy.js";
import { clearActiveJamesReviewJob, humanReadableWorkerOutput, isActiveJamesReviewJob, queueJamesCompletionReview } from "../services/worker-supervision.js";
import { markTaskExecutionBlocked, markTaskExecutionCompleted, markTaskExecutionRunning, reopenTaskExecution } from "../services/task-execution-control.js";

const router: IRouter = Router();
const MAX_AUTOMATIC_REWORKS = 3;

async function addMessage(taskId: number, author: string, body: string) {
  await db.insert(taskMessagesTable).values({ taskId, author, body });
  if (author !== "Cameron") await db.update(tasksTable).set({ unreadMessages: 1 }).where(eq(tasksTable.id, taskId));
}

async function automaticReworkCount(taskId: number): Promise<number> {
  const messages = await db.select().from(taskMessagesTable).where(eq(taskMessagesTable.taskId, taskId)).orderBy(asc(taskMessagesTable.createdAt));
  let lastRecoveryIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.author === "Mission Control" && message.body.startsWith("QA RECOVERY CYCLE STARTED —")) {
      lastRecoveryIndex = index;
      break;
    }
  }
  return messages.slice(lastRecoveryIndex + 1).filter(message => message.author === "James Hermes" && message.body.startsWith("QA REWORK REQUIRED —")).length;
}

async function dispatchRework(task: typeof tasksTable.$inferSelect, instructions: string): Promise<void> {
  if (!task.assignee || task.assignee === "Unassigned") {
    await markTaskExecutionBlocked(task.id, "James requires rework but no specialist worker is assigned.");
    await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, task.id));
    await addMessage(task.id, "Mission Control", "BLOCKED — James requires rework but no specialist worker is assigned.");
    return;
  }
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.name, task.assignee));
  if (!agent || !isRuntimeConfigured(agent)) {
    const reason = `James requires rework but ${task.assignee} is not currently available to execute it.`;
    await markTaskExecutionBlocked(task.id, reason);
    await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, task.id));
    await addMessage(task.id, "Mission Control", `BLOCKED — ${reason}`);
    return;
  }

  const context = JSON.stringify({ source: "james-supervisory-rework", taskId: task.id, taskTitle: task.title, project: task.project }, null, 2);
  const [command] = await db.insert(agentCommandsTable).values({ agentId: agent.id, taskId: task.id, instructions, context }).returning();
  await reopenTaskExecution(task.id);
  await markTaskExecutionRunning(task.id);
  await db.update(tasksTable).set({ status: "running" }).where(eq(tasksTable.id, task.id));
  await addMessage(task.id, "Mission Control", `James returned the work to ${agent.name} for correction.`);

  void (async () => {
    try {
      const result = await dispatchRuntime(agent, { mode: "work", instructions, context, taskId: task.id, commandId: command.id });
      await db.update(agentCommandsTable).set({ acknowledgedAt: new Date(), deliveredViaHttp: result.ok }).where(eq(agentCommandsTable.id, command.id));
      await db.insert(activityTable).values({ agentName: agent.name, action: result.ok ? "James QA rework response received" : "James QA rework failed", detail: result.output ?? result.error, status: result.ok ? "pending" : "error" });
      if (result.delivery === "queued" && result.ok) return;
      if (!result.ok) {
        const reason = result.error ?? "worker runtime failed";
        await markTaskExecutionBlocked(task.id, reason);
        await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, task.id));
        await addMessage(task.id, "Mission Control", `BLOCKED — ${agent.name} could not complete James's requested rework: ${reason}`);
        return;
      }
      const visible = humanReadableWorkerOutput(result.output);
      if (visible) await addMessage(task.id, agent.name, visible);
      await db.update(tasksTable).set({ status: "completion_pending" }).where(eq(tasksTable.id, task.id));
      await addMessage(task.id, "Mission Control", "Worker correction received. James supervisory verification is required before Review or Done.");
      await queueJamesCompletionReview(task.id, agent.name, result.output);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown rework dispatch error";
      await markTaskExecutionBlocked(task.id, detail);
      await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, task.id));
      await addMessage(task.id, "Mission Control", `BLOCKED — automatic James rework cycle failed: ${detail}`);
    }
  })();
}

router.post("/james/completion-review-report", async (req, res): Promise<void> => {
  const taskId = Number(req.body?.taskId);
  const jobId = typeof req.body?.jobId === "string" ? req.body.jobId.trim() : "";
  const workerName = typeof req.body?.workerName === "string" ? req.body.workerName.trim() : "specialist worker";
  const exitCode = Number(req.body?.exitCode ?? 1);
  const requestedDecision = req.body?.decision === "VERIFIED_COMPLETE" ? "VERIFIED_COMPLETE" : "REWORK_REQUIRED";
  const reason = typeof req.body?.reason === "string" && req.body.reason.trim() ? req.body.reason.trim() : "James did not provide a factual review reason.";
  const evidence: string[] = Array.isArray(req.body?.evidence) ? req.body.evidence.filter((item: unknown): item is string => typeof item === "string" && Boolean(item.trim())).map((item: string) => item.trim()) : [];
  const rework = typeof req.body?.rework === "string" ? req.body.rework.trim() : "";
  const escalatedOwnerReview = req.body?.ownerReview === true;
  const ownerReviewReason = typeof req.body?.ownerReviewReason === "string" ? req.body.ownerReviewReason.trim() : "";

  if (!Number.isInteger(taskId) || taskId <= 0 || !jobId) { res.status(400).json({ error: "valid taskId and jobId are required" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (!(await isActiveJamesReviewJob(taskId, jobId))) {
    res.json({ accepted: false, taskId, staleReviewIgnored: true });
    return;
  }
  if (task.status !== "completion_pending") {
    await clearActiveJamesReviewJob(taskId, jobId);
    res.json({ accepted: false, taskId, staleReviewIgnored: true, status: task.status });
    return;
  }
  await clearActiveJamesReviewJob(taskId, jobId);

  if (exitCode !== 0) {
    const detail = `James supervisory review failed to execute for ${workerName}.`;
    await markTaskExecutionBlocked(taskId, detail);
    await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, taskId));
    await addMessage(taskId, "Mission Control", `BLOCKED — ${detail} The task was not marked complete.`);
    res.json({ accepted: true, taskId, status: "blocked", decision: "REVIEW_FAILED" });
    return;
  }

  const decision = requestedDecision === "VERIFIED_COMPLETE" && evidence.length === 0 ? "REWORK_REQUIRED" : requestedDecision;
  if (decision === "REWORK_REQUIRED") {
    const count = await automaticReworkCount(taskId);
    const correction = rework || `Re-check the original owner brief and correct the issues identified by James: ${reason}`;
    await addMessage(taskId, "James Hermes", `QA REWORK REQUIRED — ${reason}\nCorrection required: ${correction}`);
    if (count >= MAX_AUTOMATIC_REWORKS - 1) {
      const detail = `Automatic James QA reached the ${MAX_AUTOMATIC_REWORKS}-cycle safety limit.`;
      await markTaskExecutionBlocked(taskId, detail);
      await db.update(tasksTable).set({
        status: "blocked",
        nextAction: "James must change the delegated recovery plan before another specialist QA cycle.",
        nextActionOwner: "James Hermes",
        ownerDecisionReason: null,
      }).where(eq(tasksTable.id, taskId));
      await addMessage(taskId, "Mission Control", `BLOCKED — ${detail} This remains inside orchestrator authority; James must change the worker, evidence source, access path, or verification plan before retrying. Owner input is not required unless a protected action or owner-only access is identified.`);
      res.json({ accepted: true, taskId, status: "blocked", decision, reworkLimitReached: true, nextActionOwner: "James Hermes" });
      return;
    }
    await dispatchRework(task, `James supervisory review found the previous result unsatisfactory.\n\nReason:\n${reason}\n\nRequired correction:\n${correction}\n\nOriginal owner brief remains authoritative:\n${task.description ?? ""}\n\nDo not repeat unsupported claims. Return only the corrected task result and supporting evidence.`);
    res.json({ accepted: true, taskId, status: "running", decision, reworkQueued: true });
    return;
  }

  const reviewReason = ownerReviewReason || (task.ownerReviewRequired ? "The task was explicitly marked Owner Review Required at creation." : "");
  if (escalatedOwnerReview && !reviewReason) {
    const detail = "James requested owner review without a factual reason.";
    await markTaskExecutionBlocked(taskId, detail);
    await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, taskId));
    await addMessage(taskId, "Mission Control", `BLOCKED — ${detail} The task was not marked complete; supervisory output must be corrected.`);
    res.json({ accepted: true, taskId, status: "blocked", decision: "INVALID_REVIEW_OUTPUT" });
    return;
  }

  let route;
  try {
    route = routeVerifiedCompletion({ decision: "VERIFIED_COMPLETE", ownerReviewRequired: task.ownerReviewRequired, escalatedOwnerReview, reviewReason });
  } catch (error) {
    const detail = `James supervisory routing output was invalid: ${error instanceof Error ? error.message : "invalid owner-review escalation"}.`;
    await markTaskExecutionBlocked(taskId, detail);
    await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, taskId));
    await addMessage(taskId, "Mission Control", `BLOCKED — ${detail} The task was not marked complete.`);
    res.json({ accepted: true, taskId, status: "blocked", decision: "INVALID_REVIEW_OUTPUT" });
    return;
  }
  await db.update(tasksTable).set({ status: route.status, updatedAt: new Date() }).where(eq(tasksTable.id, taskId));
  await markTaskExecutionCompleted(taskId, {
    summary: reason,
    evidence,
    verifiedBy: "James Hermes",
    taskStatus: route.status,
  });
  await addMessage(taskId, "James Hermes", `QA VERIFIED COMPLETE — ${reason}\nVerification evidence:\n${evidence.map(item => `- ${item}`).join("\n")}`);
  if (route.status === "review") await addMessage(taskId, "Mission Control", `OWNER REVIEW REQUIRED — ${reviewReason}`);
  else await addMessage(taskId, "Mission Control", "DONE — James independently verified the worker result against the owner brief and evidence.");
  res.json({ accepted: true, taskId, status: route.status, decision: "VERIFIED_COMPLETE", ownerReviewRequired: route.status === "review" });
});

export default router;
