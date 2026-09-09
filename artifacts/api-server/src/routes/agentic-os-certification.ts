import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { agentsTable, db, tasksTable } from "@workspace/db";
import { auditLog } from "../lib/audit.js";
import {
  buildExecutionHarnessContract,
  contractFromRequirements,
} from "../services/agentic-harness.js";
import {
  ensureTaskWorkRequest,
  latestTaskWorkRequest,
  markTaskExecutionCompleted,
  markTaskExecutionRunning,
} from "../services/task-execution-control.js";

const router: IRouter = Router();

router.post("/agentic-os/certification/probe", async (_req, res): Promise<void> => {
  let taskId: number | null = null;
  try {
    const [agent] = await db.select().from(agentsTable).orderBy(agentsTable.id).limit(1);
    if (!agent) {
      res.status(409).json({ passed: false, error: "No employee exists to anchor the live execution probe." });
      return;
    }

    const [task] = await db.insert(tasksTable).values({
      title: `CERTIFICATION HARNESS REPLAY ${Date.now()}`,
      description: "Temporary self-cleaning Mission Control execution-harness certification probe.",
      assignee: agent.name,
      priority: "low",
      status: "backlog",
      project: "Mission Control Certification",
      recurrence: "one_off",
      approvalRequired: false,
      ownerReviewRequired: false,
    }).returning();
    taskId = task.id;

    await ensureTaskWorkRequest({ task, agentId: agent.id, routingReason: "Agentic OS live certification probe" });
    await markTaskExecutionRunning(task.id);

    const beforeFailure = await latestTaskWorkRequest(task.id);
    const contract = beforeFailure ? contractFromRequirements(beforeFailure.requirements) : null;
    if (!beforeFailure || !contract) throw new Error("Execution harness contract was not attached to the certification Work Request.");

    const failedAttempt = await markTaskExecutionCompleted(task.id, {
      summary: "Unsupported completion claim used intentionally by certification.",
      evidence: [],
      blockers: [],
    });
    const afterFailure = await latestTaskWorkRequest(task.id);
    const harnessAfterFailure = afterFailure?.requirements && typeof afterFailure.requirements === "object"
      ? (afterFailure.requirements as Record<string, unknown>).agenticHarness as Record<string, unknown> | undefined
      : undefined;
    const replayLog = Array.isArray(harnessAfterFailure?.failureReplayLog) ? harnessAfterFailure.failureReplayLog : [];
    const lastEvaluation = harnessAfterFailure?.lastEvaluation && typeof harnessAfterFailure.lastEvaluation === "object"
      ? harnessAfterFailure.lastEvaluation as Record<string, unknown>
      : {};
    const badResultRejected = failedAttempt?.state === "running" && lastEvaluation.passed === false && replayLog.length > 0;

    const completed = await markTaskExecutionCompleted(task.id, {
      summary: "Certification supplied valid evidence and independent verification.",
      evidence: ["live certification evidence"],
      blockers: [],
      verifiedBy: "James Hermes",
    });
    const completedRequest = await latestTaskWorkRequest(task.id);
    const goodResultAccepted = completed?.state === "completed" && completedRequest?.state === "completed";

    const protectedContract = buildExecutionHarnessContract({
      title: "Deploy production certification gate",
      description: "Certification only. Do not deploy. Demonstrate protected production capability detection.",
      approvalRequired: true,
    });
    const protectedCapabilityDetected = protectedContract.capabilityScope.protected.includes("production_change");

    const passed = badResultRejected && goodResultAccepted && protectedCapabilityDetected;
    await auditLog({
      action: "agentic_os_live_certification_probe",
      entityType: "system",
      entityId: "agentic-os-1.6",
      actorType: "admin",
      actorName: "Mission Control",
      metadata: JSON.stringify({ badResultRejected, replayRecorded: replayLog.length > 0, goodResultAccepted, protectedCapabilityDetected }),
    });

    res.json({
      passed,
      employee: agent.name,
      checks: {
        contractAttached: Boolean(contract),
        badResultRejected,
        failedEvalReplayRecorded: replayLog.length > 0,
        goodResultAccepted,
        protectedCapabilityDetected,
      },
    });
  } catch (error) {
    res.status(500).json({ passed: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    if (taskId) await db.delete(tasksTable).where(eq(tasksTable.id, taskId)).catch(() => undefined);
  }
});

export default router;
