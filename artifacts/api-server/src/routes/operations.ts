import { Router, type IRouter } from "express";
import { desc, inArray } from "drizzle-orm";
import {
  agentExecutionScopesTable,
  agentsTable,
  approvalsTable,
  db,
  signalsTable,
  tasksTable,
  workRequestsTable,
} from "@workspace/db";
const router: IRouter = Router();
router.get("/operations/agents", async (_req, res) => {
  const [agents, requests, scopes] = await Promise.all([
    db.select().from(agentsTable),
    db
      .select()
      .from(workRequestsTable)
      .orderBy(desc(workRequestsTable.createdAt))
      .limit(500),
    db.select().from(agentExecutionScopesTable),
  ]);
  const now = Date.now();
  res.json({
    data: agents.map((agent) => {
      const owned = requests.filter((request) => request.agentId === agent.id);
      const lastPing = agent.lastPing?.getTime() ?? null;
      const health =
        agent.status === "error"
          ? "error"
          : lastPing === null
            ? "offline"
            : now - lastPing > 300_000
              ? "offline"
              : now - lastPing > 120_000
                ? "degraded"
                : owned.some((request) => request.state === "running")
                  ? "online"
                  : "idle";
      const completed = owned.filter(
        (request) => request.state === "completed",
      );
      return {
        id: agent.id,
        name: agent.name,
        health,
        lastHeartbeat: agent.lastPing,
        runtime: agent.provider ?? "UNKNOWN",
        provider: agent.provider,
        model: agent.model,
        current:
          owned.find((request) =>
            ["acknowledged", "running"].includes(request.state),
          ) ?? null,
        queueDepth: owned.filter((request) =>
          ["approved", "dispatched"].includes(request.state),
        ).length,
        running: owned.filter((request) => request.state === "running").length,
        awaitingApprovals: owned.filter(
          (request) => request.state === "awaiting_approval",
        ).length,
        recentCompleted: completed.slice(0, 5),
        recentFailed: owned
          .filter((request) => request.state === "failed")
          .slice(0, 5),
        lastError: owned.find((request) => request.error)?.error ?? null,
        scopes: scopes.filter((scope) => scope.agentId === agent.id),
        usage: {
          inputTokens: completed.reduce(
            (sum, request) => sum + (request.inputTokens ?? 0),
            0,
          ),
          outputTokens: completed.reduce(
            (sum, request) => sum + (request.outputTokens ?? 0),
            0,
          ),
          cost: completed.some((request) => request.providerCost !== null)
            ? completed.reduce(
                (sum, request) => sum + Number(request.providerCost ?? 0),
                0,
              )
            : null,
        },
      };
    }),
  });
});
router.get("/operations/brief", async (_req, res) => {
  const [tasks, requests, approvals, signals] = await Promise.all([
    db.select().from(tasksTable).orderBy(desc(tasksTable.updatedAt)).limit(200),
    db
      .select()
      .from(workRequestsTable)
      .orderBy(desc(workRequestsTable.updatedAt))
      .limit(200),
    db
      .select()
      .from(approvalsTable)
      .where(inArray(approvalsTable.status, ["pending"]))
      .limit(100),
    db
      .select()
      .from(signalsTable)
      .where(inArray(signalsTable.status, ["new", "open"]))
      .orderBy(desc(signalsTable.detectedAt))
      .limit(20),
  ]);
  const shipped = requests.filter(
    (request) =>
      request.state === "completed" &&
      request.finishedAt &&
      Date.now() - request.finishedAt.getTime() < 86_400_000,
  );
  const priorities = tasks
    .filter((task) => !["done", "archived"].includes(task.status))
    .sort(
      (a, b) =>
        ["critical", "high", "medium", "low"].indexOf(a.priority) -
        ["critical", "high", "medium", "low"].indexOf(b.priority),
    )
    .slice(0, 5);
  res.json({
    generatedAt: new Date(),
    sections: {
      needsYou: approvals,
      runningNow: requests.filter((request) => request.state === "running"),
      blocked: requests.filter((request) => request.state === "blocked"),
      topPriorities: priorities,
      shippedSinceLastBrief: shipped,
      risks: signals,
      upcoming: tasks.filter((task) => task.dueDate).slice(0, 10),
      recommendedNextAction: approvals[0]
        ? `Review approval #${approvals[0].id}`
        : requests.find((request) => request.state === "blocked")
          ? "Review the oldest blocked execution"
          : priorities[0]
            ? `Review priority task #${priorities[0].id}`
            : "No action supported by current data",
    },
  });
});
router.get("/operations/automations", async (_req, res) => {
  const tasks = await db
    .select()
    .from(tasksTable)
    .orderBy(desc(tasksTable.updatedAt))
    .limit(500);
  res.json({
    data: tasks
      .filter((task) => Boolean(task.dueDate) || task.recurrence !== "one_off")
      .map((task) => ({
        id: task.id,
        name: task.title,
        schedule: task.recurrence,
        worker: task.assignee,
        project: task.project,
        enabled: task.archivedAt === null,
        nextRun: task.dueDate,
        lastRun: null,
        lastResult: task.report,
        lastError: task.status === "blocked" ? "BLOCKED" : null,
        cost: null,
      })),
  });
});
export default router;
