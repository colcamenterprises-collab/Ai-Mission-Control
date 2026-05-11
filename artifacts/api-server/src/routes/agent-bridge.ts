import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, agentsTable, activityTable, tasksTable, memoriesTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { serializeDates } from "../utils/serialize.js";
import {
  AgentPingBody,
  AgentReportBody,
  DispatchAgentBody,
  DispatchAgentParams,
  RegenerateAgentTokenParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function agentFromBearer(authHeader: string | undefined): Promise<typeof agentsTable.$inferSelect | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.inboundToken, token));
  return agent ?? null;
}

/* ─── POST /agent/ping ────────────────────────────────────────
   Called by the Docker agent on a heartbeat (e.g. every 30s).
   Returns any tasks currently assigned to this agent.
──────────────────────────────────────────────────────────────── */
router.post("/agent/ping", async (req, res): Promise<void> => {
  const agent = await agentFromBearer(req.headers.authorization);
  if (!agent) {
    res.status(401).json({ error: "Invalid or missing bearer token" });
    return;
  }

  const parsed = AgentPingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.update(agentsTable)
    .set({ lastPing: new Date(), status: "active" })
    .where(eq(agentsTable.id, agent.id));

  const pendingTasks = await db
    .select({ id: tasksTable.id, title: tasksTable.title, priority: tasksTable.priority, status: tasksTable.status })
    .from(tasksTable)
    .where(eq(tasksTable.assignee, agent.name));

  res.json({
    agentId: agent.id,
    name: agent.name,
    acknowledged: true,
    pendingTasks,
  });
});

/* ─── POST /agent/report ──────────────────────────────────────
   Called by the Docker agent to push back:
     type = "activity"      → adds a live-activity entry
     type = "task_complete" → marks task done + adds activity
     type = "memory"        → stores a memory document
──────────────────────────────────────────────────────────────── */
router.post("/agent/report", async (req, res): Promise<void> => {
  const agent = await agentFromBearer(req.headers.authorization);
  if (!agent) {
    res.status(401).json({ error: "Invalid or missing bearer token" });
    return;
  }

  const parsed = AgentReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { type, content, taskId, taskStatus, memoryTitle, memoryCategory } = parsed.data;

  const actionLabel =
    type === "task_complete" ? "Completed task" :
    type === "memory" ? "Stored memory" :
    content.slice(0, 80);

  const [activity] = await db.insert(activityTable).values({
    agentName: agent.name,
    action: actionLabel,
    detail: content,
    status: type === "task_complete" ? "active" : "active",
  }).returning();

  if (type === "task_complete" && taskId) {
    await db.update(tasksTable)
      .set({ status: (taskStatus ?? "done") as typeof tasksTable.$inferInsert["status"] })
      .where(eq(tasksTable.id, taskId));
  }

  if (type === "memory" && memoryTitle) {
    await db.insert(memoriesTable).values({
      title: memoryTitle,
      content,
      category: memoryCategory ?? "agent",
      preview: content.slice(0, 150),
    });
  }

  const agentUpdate: Partial<typeof agentsTable.$inferInsert> = { lastPing: new Date() };
  if (type === "task_complete") {
    agentUpdate.tasksCompleted = agent.tasksCompleted + 1;
    agentUpdate.currentTask = null;
    agentUpdate.status = "idle";
  } else {
    agentUpdate.currentTask = content.slice(0, 100);
    agentUpdate.status = "active";
    agentUpdate.lastActive = "just now";
  }

  await db.update(agentsTable).set(agentUpdate).where(eq(agentsTable.id, agent.id));

  res.json({ accepted: true, activityId: activity.id });
});

/* ─── POST /agents/:id/dispatch ──────────────────────────────
   Called from Mission Control UI to push instructions to the
   agent's Docker endpoint. Uses the agent's stored apiKey as
   outbound auth.
──────────────────────────────────────────────────────────────── */
router.post("/agents/:id/dispatch", async (req, res): Promise<void> => {
  const params = DispatchAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, params.data.id));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  if (!agent.endpoint) {
    res.status(400).json({ error: "Agent has no endpoint configured" });
    return;
  }

  const parsed = DispatchAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { instructions, taskId, context } = parsed.data;
  const payload = {
    instructions,
    taskId: taskId ?? null,
    context: context ?? null,
    source: "mission-control",
    timestamp: new Date().toISOString(),
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (agent.apiKey) headers["Authorization"] = `Bearer ${agent.apiKey}`;

  let dispatched = false;
  let statusCode: number | null = null;
  let error: string | null = null;

  try {
    const response = await fetch(agent.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = response.status;
    dispatched = response.ok;
    if (!response.ok) error = `Agent returned HTTP ${response.status}`;
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "Network error";
  }

  await db.insert(activityTable).values({
    agentName: agent.name,
    action: dispatched ? "Received dispatch from Mission Control" : "Dispatch failed",
    detail: `${instructions.slice(0, 200)}${error ? ` — Error: ${error}` : ""}`,
    status: dispatched ? "active" : "idle",
  });

  res.json({ dispatched, agentId: agent.id, endpoint: agent.endpoint, statusCode, error });
});

/* ─── POST /agents/:id/token ─────────────────────────────────
   Regenerates the inbound bearer token for an agent.
   Call this once to get the token your Docker agent will use.
──────────────────────────────────────────────────────────────── */
router.post("/agents/:id/token", async (req, res): Promise<void> => {
  const params = RegenerateAgentTokenParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const token = randomUUID();
  const [agent] = await db.update(agentsTable)
    .set({ inboundToken: token })
    .where(eq(agentsTable.id, params.data.id))
    .returning();

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.json({ agentId: agent.id, inboundToken: token });
});

export default router;
