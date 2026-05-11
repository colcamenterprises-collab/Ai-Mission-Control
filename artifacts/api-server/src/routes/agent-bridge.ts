import { Router, type IRouter } from "express";
import { eq, isNull } from "drizzle-orm";
import {
  db,
  agentsTable,
  activityTable,
  tasksTable,
  memoriesTable,
  agentCommandsTable,
  agentToolAccessTable,
  agentToolsTable,
} from "@workspace/db";
import { getAgentFromBearer } from "../lib/auth.js";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";
import { decryptSecret, generateAgentToken, hashToken } from "../lib/security.js";
import {
  AgentPingBody,
  AgentReportBody,
  DispatchAgentBody,
  DispatchAgentParams,
  RegenerateAgentTokenParams,
  AckAgentCommandParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

/* ─── POST /agent/ping ────────────────────────────────────────
   Heartbeat from any agent (local, Docker, hosted).
   Returns pending tasks AND any queued commands waiting to
   be picked up (the pull-based dispatch mechanism).
──────────────────────────────────────────────────────────────── */
router.post("/agent/ping", createRateLimit("agent-ping", 60, 60_000), async (req, res): Promise<void> => {
  const agent = await getAgentFromBearer(req.headers.authorization);
  if (!agent) {
    res.status(401).json({ error: "Invalid or missing bearer token" });
    return;
  }

  const parsed = AgentPingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db
    .update(agentsTable)
    .set({ lastPing: new Date(), status: "active" })
    .where(eq(agentsTable.id, agent.id));

  // Tasks assigned to this agent by name
  const pendingTasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      priority: tasksTable.priority,
      status: tasksTable.status,
    })
    .from(tasksTable)
    .where(eq(tasksTable.assignee, agent.name));

  // Queued commands not yet acknowledged — the pull-based fallback for local agents
  const pendingCommands = await db
    .select({
      id: agentCommandsTable.id,
      instructions: agentCommandsTable.instructions,
      context: agentCommandsTable.context,
      taskId: agentCommandsTable.taskId,
      createdAt: agentCommandsTable.createdAt,
    })
    .from(agentCommandsTable)
    .where(
      eq(agentCommandsTable.agentId, agent.id),
    )
    .then(rows => rows.filter(r => r.createdAt !== null));

  // Only return unacknowledged commands
  const rawCommands = await db
    .select()
    .from(agentCommandsTable)
    .where(eq(agentCommandsTable.agentId, agent.id));

  const unacked = rawCommands
    .filter(c => c.acknowledgedAt === null)
    .map(c => ({
      id: c.id,
      instructions: c.instructions,
      context: c.context ?? null,
      taskId: c.taskId ?? null,
      createdAt: c.createdAt.toISOString(),
    }));

  res.json({
    agentId: agent.id,
    name: agent.name,
    acknowledged: true,
    pendingTasks,
    pendingCommands: unacked,
  });
});

/* ─── POST /agent/command/:id/ack ────────────────────────────
   Agent acknowledges it has received and started processing a
   queued command. Mission Control marks it delivered.
──────────────────────────────────────────────────────────────── */
router.post("/agent/command/:id/ack", createRateLimit("agent-ack", 60, 60_000), async (req, res): Promise<void> => {
  const agent = await getAgentFromBearer(req.headers.authorization);
  if (!agent) {
    res.status(401).json({ error: "Invalid or missing bearer token" });
    return;
  }

  const params = AckAgentCommandParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [cmd] = await db
    .update(agentCommandsTable)
    .set({ acknowledgedAt: new Date() })
    .where(eq(agentCommandsTable.id, params.data.id))
    .returning();

  if (!cmd) {
    res.status(404).json({ error: "Command not found" });
    return;
  }

  res.json({ acknowledged: true, commandId: cmd.id });
});

/* ─── POST /agent/report ──────────────────────────────────────
   Agent pushes back an activity, task completion, or memory.
──────────────────────────────────────────────────────────────── */
router.post("/agent/report", createRateLimit("agent-report", 60, 60_000), async (req, res): Promise<void> => {
  const agent = await getAgentFromBearer(req.headers.authorization);
  if (!agent) {
    res.status(401).json({ error: "Invalid or missing bearer token" });
    return;
  }

  const parsed = AgentReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { type, content, taskId, taskStatus, memoryTitle, memoryCategory } =
    parsed.data;

  const actionLabel =
    type === "task_complete"
      ? "Completed task"
      : type === "memory"
        ? "Stored memory"
        : content.slice(0, 80);

  const [activity] = await db
    .insert(activityTable)
    .values({
      agentName: agent.name,
      action: actionLabel,
      detail: content,
      status: "active",
    })
    .returning();

  if (type === "task_complete" && taskId) {
    await db
      .update(tasksTable)
      .set({
        status: (taskStatus ??
          "done") as typeof tasksTable.$inferInsert["status"],
      })
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

  const agentUpdate: Partial<typeof agentsTable.$inferInsert> = {
    lastPing: new Date(),
  };
  if (type === "task_complete") {
    agentUpdate.tasksCompleted = agent.tasksCompleted + 1;
    agentUpdate.currentTask = null;
    agentUpdate.status = "idle";
  } else {
    agentUpdate.currentTask = content.slice(0, 100);
    agentUpdate.status = "active";
    agentUpdate.lastActive = "just now";
  }

  await db
    .update(agentsTable)
    .set(agentUpdate)
    .where(eq(agentsTable.id, agent.id));

  res.json({ accepted: true, activityId: activity.id });
});

/* ─── POST /agents/:id/dispatch ──────────────────────────────
   Send instructions to an agent from Mission Control.

   Delivery strategy:
   1. Always store in the command queue first (works for any network).
   2. If the agent has a public endpoint, also attempt an HTTP push
      (10s timeout). This gives immediate delivery for hosted agents.
   3. Local/firewalled agents simply pick the command up on their
      next ping — zero extra configuration needed.
──────────────────────────────────────────────────────────────── */
router.post("/agents/:id/dispatch", createRateLimit("admin-dispatch", 20, 60_000), async (req, res): Promise<void> => {
  const params = DispatchAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, params.data.id));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const parsed = DispatchAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { instructions, taskId, context } = parsed.data;

  // Step 1 — queue the command unconditionally
  const [command] = await db
    .insert(agentCommandsTable)
    .values({
      agentId: agent.id,
      instructions,
      context: context ?? null,
      taskId: taskId ?? null,
    })
    .returning();

  // Step 2 — attempt HTTP push if the agent has a public endpoint
  let dispatched = false;
  let statusCode: number | null = null;
  let httpError: string | null = null;

  if (agent.endpoint) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (agent.apiKey) headers["Authorization"] = `Bearer ${agent.apiKey}`;

    try {
      const response = await fetch(agent.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          commandId: command.id,
          instructions,
          taskId: taskId ?? null,
          context: context ?? null,
          source: "mission-control",
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      statusCode = response.status;
      dispatched = response.ok;
      if (!response.ok) httpError = `Agent returned HTTP ${response.status}`;

      // If HTTP delivery succeeded, mark the command as acknowledged
      if (dispatched) {
        await db
          .update(agentCommandsTable)
          .set({ acknowledgedAt: new Date(), deliveredViaHttp: true })
          .where(eq(agentCommandsTable.id, command.id));
      }
    } catch (err: unknown) {
      httpError =
        err instanceof Error ? err.message : "Network error";
    }
  }

  const delivery = dispatched ? "http" : "queued";

  await db.insert(activityTable).values({
    agentName: agent.name,
    action:
      delivery === "http"
        ? "Received dispatch (HTTP)"
        : "Command queued — picks up on next ping",
    detail: `${instructions.slice(0, 200)}${httpError ? ` — ${httpError}` : ""}`,
    status: delivery === "http" ? "active" : "pending",
  });

  res.json({
    queued: true,
    commandId: command.id,
    dispatched,
    delivery,
    agentId: agent.id,
    endpoint: agent.endpoint ?? null,
    statusCode,
    error: httpError,
  });
});

/* ─── POST /agents/:id/token ─────────────────────────────────
   Mint or regenerate the inbound Bearer token.
──────────────────────────────────────────────────────────────── */
router.post("/agents/:id/token", createRateLimit("admin-token", 10, 60_000), async (req, res): Promise<void> => {
  const params = RegenerateAgentTokenParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const token = generateAgentToken();
  const tokenHash = hashToken(token);
  const [agent] = await db
    .update(agentsTable)
    .set({ inboundToken: tokenHash })
    .where(eq(agentsTable.id, params.data.id))
    .returning();

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  await auditLog({ action: "regenerated", entityType: "agent_token", entityId: agent.id, actorType: "admin" });
  res.json({ agentId: agent.id, inboundToken: token });
});

/* ─── GET /agent/tools ───────────────────────────────────────────
   Authenticated agent fetches its assigned tools with FULL credentials.
   Only accessible via Bearer token — credentials are never exposed to the UI.
──────────────────────────────────────────────────────────────────── */
router.get("/agent/tools", createRateLimit("agent-tools", 20, 60_000), async (req, res): Promise<void> => {
  const agent = await getAgentFromBearer(req.headers.authorization);
  if (!agent) {
    res.status(401).json({ error: "Invalid or missing bearer token" });
    return;
  }

  const rows = await db
    .select({ tool: agentToolsTable })
    .from(agentToolAccessTable)
    .innerJoin(agentToolsTable, eq(agentToolAccessTable.toolId, agentToolsTable.id))
    .where(eq(agentToolAccessTable.agentId, agent.id));

  const tools = rows
    .filter(r => r.tool.isActive)
    .map(r => ({
      id: r.tool.id,
      name: r.tool.name,
      description: r.tool.description,
      url: r.tool.url,
      category: r.tool.category,
      credentialType: r.tool.credentialType,
      apiKey: decryptSecret(r.tool.apiKey),
      username: decryptSecret(r.tool.username),
      password: decryptSecret(r.tool.password),
      notes: r.tool.notes,
      isActive: r.tool.isActive,
    }));

  await auditLog({ action: "requested", entityType: "agent_tool_credentials", entityId: agent.id, actorType: "agent", actorName: agent.name });
  res.json(tools);
});

export default router;
