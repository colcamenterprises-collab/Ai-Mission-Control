import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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
import { formatSkillsForPrompt, listSkills, readSkill, readSkillsForDelegation } from "../services/skills.js";
import { getAssignedSkillNamesForAgent } from "../config-operational-agents.js";
import { dispatchRuntime, isRuntimeConfigured } from "../services/agent-runtime.js";

const router: IRouter = Router();

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isJamesHermes(agent: typeof agentsTable.$inferSelect): boolean {
  return agent.provider === "hermes" || agent.name.toLowerCase().includes("james hermes");
}

async function agentSkillsContext(agentName: string, context?: string | null): Promise<string | null> {
  const assignedSkillNames = getAssignedSkillNamesForAgent(agentName);
  const assignedSkills = await readSkillsForDelegation({ names: assignedSkillNames });
  const skillsContext = formatSkillsForPrompt(assignedSkills);
  return [context ?? null, skillsContext ? `Relevant assigned skills:\n\n${skillsContext}` : null].filter(Boolean).join("\n\n") || null;
}

async function loadAgentById(id: number) {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  return agent ?? null;
}

router.get("/agent/skills", createRateLimit("agent-skills", 60, 60_000), async (req, res): Promise<void> => {
  const agent = await getAgentFromBearer(req.headers.authorization);
  if (!agent) {
    res.status(401).json({ error: "Invalid or missing bearer token" });
    return;
  }

  const name = typeof req.query.name === "string" ? req.query.name : null;
  const category = typeof req.query.category === "string" ? req.query.category : null;
  const result = await listSkills({ name, category });
  res.json({ agentId: agent.id, ...result });
});

router.get("/agent/skills/:id", createRateLimit("agent-skills", 60, 60_000), async (req, res): Promise<void> => {
  const agent = await getAgentFromBearer(req.headers.authorization);
  if (!agent) {
    res.status(401).json({ error: "Invalid or missing bearer token" });
    return;
  }

  const skill = await readSkill(String(req.params.id));
  if (!skill) {
    res.status(404).json({ error: "Skill not found" });
    return;
  }
  res.json({ agentId: agent.id, skill });
});

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

  await db.update(agentsTable).set({ lastPing: new Date(), status: "active" }).where(eq(agentsTable.id, agent.id));

  const pendingTasks = await db
    .select({ id: tasksTable.id, title: tasksTable.title, priority: tasksTable.priority, status: tasksTable.status })
    .from(tasksTable)
    .where(eq(tasksTable.assignee, agent.name));

  const rawCommands = await db.select().from(agentCommandsTable).where(eq(agentCommandsTable.agentId, agent.id));
  const unacked = rawCommands
    .filter(c => c.acknowledgedAt === null)
    .map(c => ({ id: c.id, instructions: c.instructions, context: c.context ?? null, taskId: c.taskId ?? null, createdAt: c.createdAt.toISOString() }));

  res.json({ agentId: agent.id, name: agent.name, acknowledged: true, pendingTasks, pendingCommands: unacked });
});

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

  const [cmd] = await db.update(agentCommandsTable).set({ acknowledgedAt: new Date() }).where(eq(agentCommandsTable.id, params.data.id)).returning();
  if (!cmd || cmd.agentId !== agent.id) {
    res.status(404).json({ error: "Command not found" });
    return;
  }

  res.json({ acknowledged: true, commandId: cmd.id });
});

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

  const { type, content, taskId, taskStatus, memoryTitle, memoryCategory } = parsed.data;
  const actionLabel = type === "task_complete" ? "Completed task" : type === "memory" ? "Stored memory" : content.slice(0, 80);

  const [activity] = await db.insert(activityTable).values({ agentName: agent.name, action: actionLabel, detail: content, status: "active" }).returning();

  if (type === "task_complete" && taskId) {
    await db.update(tasksTable).set({ status: (taskStatus ?? "done") as typeof tasksTable.$inferInsert["status"] }).where(eq(tasksTable.id, taskId));
  }

  if (type === "memory" && memoryTitle) {
    await db.insert(memoriesTable).values({ title: memoryTitle, content, category: memoryCategory ?? "knowledge", preview: content.slice(0, 150) });
  }

  const agentUpdate: Partial<typeof agentsTable.$inferInsert> = { lastPing: new Date() };
  if (type === "task_complete") {
    agentUpdate.tasksCompleted = agent.tasksCompleted + 1;
    agentUpdate.currentTask = null;
    agentUpdate.status = isJamesHermes(agent) ? "active" : "idle";
    agentUpdate.lastActive = "reported completed work";
  } else {
    agentUpdate.currentTask = content.slice(0, 100);
    agentUpdate.status = "active";
    agentUpdate.lastActive = "just now";
  }

  await db.update(agentsTable).set(agentUpdate).where(eq(agentsTable.id, agent.id));
  res.json({ accepted: true, activityId: activity.id });
});

router.post("/agents/:id/test", createRateLimit("admin-agent-test", 20, 60_000), async (req, res): Promise<void> => {
  const params = DispatchAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const agent = await loadAgentById(params.data.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  if (!isRuntimeConfigured(agent)) {
    res.status(400).json({ ok: false, error: "Agent runtime is not configured. Add a provider API key or webhook endpoint first." });
    return;
  }

  const result = await dispatchRuntime(agent, {
    mode: "test",
    instructions: `Connection test for ${agent.name}. Reply in one short sentence confirming the connection works.`,
    context: "This is a Mission Control runtime health test.",
  });

  const [activity] = await db.insert(activityTable).values({
    agentName: agent.name,
    action: result.ok ? "Agent connection test passed" : "Agent connection test failed",
    detail: result.output ?? result.error,
    status: result.ok ? "active" : "error",
  }).returning();

  await db.update(agentsTable).set({ status: result.ok ? "active" : "error", lastActive: result.ok ? "connection tested" : "connection test failed", lastPing: result.ok ? new Date() : agent.lastPing }).where(eq(agentsTable.id, agent.id));

  res.status(result.ok ? 200 : 502).json({ ...result, activityId: activity.id });
});

router.post("/agents/:id/test-task", createRateLimit("admin-agent-test-task", 10, 60_000), async (req, res): Promise<void> => {
  const params = DispatchAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const agent = await loadAgentById(params.data.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  if (!isRuntimeConfigured(agent)) {
    res.status(400).json({ ok: false, error: "Agent runtime is not configured. Add a provider API key or webhook endpoint first." });
    return;
  }

  const title = optionalString(req.body?.title) ?? `Test work for ${agent.name}`;
  const instructions = optionalString(req.body?.instructions) ?? "Write a short Mission Control test report confirming you received and completed this work item.";
  const project = optionalString(req.body?.project) ?? "Mission Control";
  const priority = optionalString(req.body?.priority) ?? "medium";

  const [task] = await db.insert(tasksTable).values({ title, description: instructions, assignee: agent.name, priority, status: "running", project, dueDate: null }).returning();
  const contextWithSkills = await agentSkillsContext(agent.name, "This is an immediate test task executed by the Mission Control runtime.");
  const [command] = await db.insert(agentCommandsTable).values({ agentId: agent.id, taskId: task.id, instructions, context: contextWithSkills }).returning();

  const result = await dispatchRuntime(agent, { mode: "work", instructions, context: contextWithSkills, taskId: task.id, commandId: command.id });

  await db.update(agentCommandsTable).set({ acknowledgedAt: new Date(), deliveredViaHttp: result.ok || result.delivery === "webhook" }).where(eq(agentCommandsTable.id, command.id));
  await db.update(tasksTable).set({ status: result.ok ? "done" : "blocked" }).where(eq(tasksTable.id, task.id));
  await db.update(agentsTable).set({ status: result.ok ? (isJamesHermes(agent) ? "active" : "idle") : "error", currentTask: result.ok ? null : `Task #${task.id}: ${title}`, lastActive: result.ok ? "work report saved" : "test task failed", lastPing: result.ok ? new Date() : agent.lastPing, tasksCompleted: result.ok ? agent.tasksCompleted + 1 : agent.tasksCompleted }).where(eq(agentsTable.id, agent.id));

  const [activity] = await db.insert(activityTable).values({
    agentName: agent.name,
    action: result.ok ? "Completed test work" : "Test work failed",
    detail: result.output ?? result.error,
    status: result.ok ? "active" : "error",
  }).returning();

  res.status(result.ok ? 201 : 502).json({ ok: result.ok, taskId: task.id, commandId: command.id, activityId: activity.id, result });
});

router.post("/agents/:id/dispatch", createRateLimit("admin-dispatch", 20, 60_000), async (req, res): Promise<void> => {
  const params = DispatchAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const agent = await loadAgentById(params.data.id);
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
  const contextWithSkills = await agentSkillsContext(agent.name, context);
  const [command] = await db.insert(agentCommandsTable).values({ agentId: agent.id, instructions, context: contextWithSkills, taskId: taskId ?? null }).returning();

  let dispatched = false;
  let delivery: "provider" | "webhook" | "queued" = "queued";
  let statusCode: number | null = null;
  let httpError: string | null = null;
  let output: string | null = null;

  if (isRuntimeConfigured(agent)) {
    const result = await dispatchRuntime(agent, { instructions, context: contextWithSkills, taskId: taskId ?? null, commandId: command.id, mode: "work" });
    dispatched = result.ok;
    delivery = result.ok ? result.delivery : "queued";
    statusCode = result.statusCode;
    httpError = result.error;
    output = result.output;
    if (dispatched) {
      await db.update(agentCommandsTable).set({ acknowledgedAt: new Date(), deliveredViaHttp: true }).where(eq(agentCommandsTable.id, command.id));
      if (taskId) await db.update(tasksTable).set({ status: "done" }).where(eq(tasksTable.id, taskId));
      await db.update(agentsTable).set({ status: isJamesHermes(agent) ? "active" : "idle", currentTask: null, lastActive: "dispatch completed", lastPing: new Date(), tasksCompleted: agent.tasksCompleted + 1 }).where(eq(agentsTable.id, agent.id));
    }
  }

  await db.insert(activityTable).values({
    agentName: agent.name,
    action: dispatched ? "Completed dispatch" : "Command queued — waiting for worker",
    detail: output ?? `${instructions.slice(0, 200)}${httpError ? ` — ${httpError}` : ""}`,
    status: dispatched ? "active" : "pending",
  });

  res.json({ queued: true, commandId: command.id, dispatched, delivery, agentId: agent.id, endpoint: agent.endpoint ?? null, statusCode, error: httpError, output });
});

router.post("/agents/:id/token", createRateLimit("admin-token", 10, 60_000), async (req, res): Promise<void> => {
  const params = RegenerateAgentTokenParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const token = generateAgentToken();
  const tokenHash = hashToken(token);
  const [agent] = await db.update(agentsTable).set({ inboundToken: tokenHash }).where(eq(agentsTable.id, params.data.id)).returning();
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  await auditLog({ action: "regenerated", entityType: "agent_token", entityId: agent.id, actorType: "admin" });
  res.json({ agentId: agent.id, inboundToken: token });
});

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

  const tools = rows.filter(r => r.tool.isActive).map(r => ({
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
