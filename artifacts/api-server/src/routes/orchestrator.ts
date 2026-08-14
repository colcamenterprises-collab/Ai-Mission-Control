import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tasksTable, agentsTable, agentCommandsTable, activityTable, taskMessagesTable } from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";
import { dispatchRuntime, isRuntimeConfigured } from "../services/agent-runtime.js";
import { formatSkillsForPrompt, readSkillsForDelegation } from "../services/skills.js";

const router: IRouter = Router();
const CORE_PLAYBOOK_CATEGORIES = ["Product", "Standard", "Spec"];
type IntakeBody = { title?: unknown; description?: unknown; project?: unknown; priority?: unknown; requestedAgent?: unknown; dueDate?: unknown; recurrence?: unknown; approvalRequired?: unknown; attachments?: unknown };
type AgentRecord = typeof agentsTable.$inferSelect;
type AgentCandidate = { agent: AgentRecord | null; name: string; role: string; department: string; reason: string; confidence: number };
const DEFAULT_PROJECT = "Mission Control";
const DEFAULT_PRIORITY = "medium";
const UNASSIGNED_AGENT_NAME = "Unassigned";

function asCleanString(value: unknown): string | null { if (typeof value !== "string") return null; const trimmed = value.trim(); return trimmed.length ? trimmed : null; }
function normalizePriority(value: unknown): string { const priority = asCleanString(value)?.toLowerCase(); if (["low", "medium", "high", "critical"].includes(priority ?? "")) return priority!; return DEFAULT_PRIORITY; }
function isRealConnectedAgent(agent: AgentRecord): boolean { return Boolean(agent.isPluggedIn || agent.endpoint || agent.inboundToken || (agent.provider && agent.model)); }
function isJamesHermes(agent: AgentRecord): boolean { return agent.provider === "hermes" || agent.name.toLowerCase().includes("james hermes"); }

async function addTaskMessage(taskId: number, author: string, body: string) {
  await db.insert(taskMessagesTable).values({ taskId, author, body });
  if (author !== "Cameron") await db.update(tasksTable).set({ unreadMessages: 1 }).where(eq(tasksTable.id, taskId));
}

async function buildPlaybookContext(context: string): Promise<string> {
  const playbooks = await readSkillsForDelegation({ categories: CORE_PLAYBOOK_CATEGORIES });
  const playbookContext = formatSkillsForPrompt(playbooks);
  const attachedNames = playbooks.map(playbook => `${playbook.category}: ${playbook.name}`).join("; ");
  return [context, attachedNames ? `Attached playbooks: ${attachedNames}` : null, playbookContext ? `Relevant operating playbooks:\n\n${playbookContext}` : null].filter(Boolean).join("\n\n");
}

/**
 * V2 orchestration rule: executable owner tasks enter Mission Control through James Hermes.
 * Specialist workers are delegated by James; owner intake must not bypass the orchestrator.
 */
async function chooseAgent(_body: Required<Pick<IntakeBody, "title" | "description">> & IntakeBody): Promise<AgentCandidate> {
  const allAgents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  const connectedAgents = allAgents.filter(isRealConnectedAgent);
  const james = connectedAgents.find(isJamesHermes);

  if (james) {
    return {
      agent: james,
      name: james.name,
      role: james.role || "Mission Control CEO / Orchestrator",
      department: james.department || "Mission Control",
      reason: "Mission Control V2 routes executable owner tasks through James Hermes. James owns orchestration and delegates specialist work as required.",
      confidence: 100,
    };
  }

  return {
    agent: null,
    name: UNASSIGNED_AGENT_NAME,
    role: "No connected orchestrator",
    department: "Unassigned",
    reason: "James Hermes is not currently connected. The task was retained in Mission Control and was not sent directly to another worker.",
    confidence: 0,
  };
}

function buildInstructions(params: { taskId: number; title: string; description: string; project: string; priority: string; assignee: string; recommendation: AgentCandidate }): string {
  return [
    `Mission Control assigned task #${params.taskId}: ${params.title}`,
    "",
    `Priority: ${params.priority}`,
    `Project: ${params.project}`,
    `Orchestrator: ${params.assignee}`,
    `Routing confidence: ${params.recommendation.confidence}%`,
    `Routing reason: ${params.recommendation.reason}`,
    "",
    "Task brief:",
    params.description,
    "",
    "Operating rules:",
    "1. You are the Mission Control CEO / Orchestrator for this task. Own it from intake through verified completion.",
    "2. Use the minimum appropriate specialist worker(s). Routine worker selection, retries, corrections, testing and review cycles do not require owner approval.",
    "3. Keep task-specific questions, findings, actions, worker evidence and results inside the Mission Control task conversation.",
    "4. Resolve normal blockers yourself. Escalate to Cameron only for a genuine owner-level blocker: owner-only credential/access, expenditure, irreversible/destructive action, material business/scope decision, or another decision existing rules do not safely resolve.",
    "5. A worker saying COMPLETE is not task completion. Independently review the success milestone, evidence and relevant tests. Return incomplete work to the worker without owner intervention.",
    "6. Only after the success milestone is genuinely verified should the task be presented for final owner acceptance/archive.",
    "7. Use only the tools and secrets authorised for the relevant agent/session.",
    "8. Never claim work or verification that was not actually performed.",
  ].join("\n");
}

async function runAssignedWork(params: { agent: AgentRecord; task: typeof tasksTable.$inferSelect; command: typeof agentCommandsTable.$inferSelect; instructions: string; context: string }): Promise<void> {
  const { agent, task, command, instructions, context } = params;
  if (!isRuntimeConfigured(agent)) {
    await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: "pending", lastActive: "work queued by Mission Control" }).where(eq(agentsTable.id, agent.id));
    await addTaskMessage(task.id, "Mission Control", `${agent.name} owns this task. Work is queued for orchestrator pickup.`);
    return;
  }
  try {
    await db.update(tasksTable).set({ status: "running", approvalRequired: false }).where(eq(tasksTable.id, task.id));
    await addTaskMessage(task.id, agent.name, "Task received. I am reviewing the brief and beginning orchestration.");
    const runtimeResult = await dispatchRuntime(agent, { mode: "work", instructions, context, taskId: task.id, commandId: command.id });
    await db.update(agentCommandsTable).set({ acknowledgedAt: new Date(), deliveredViaHttp: runtimeResult.ok }).where(eq(agentCommandsTable.id, command.id));
    if (runtimeResult.delivery === "queued" && runtimeResult.ok) {
      await db.update(tasksTable).set({ status: "running", approvalRequired: false }).where(eq(tasksTable.id, task.id));
      await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: "active", lastActive: "detached orchestration running", lastPing: new Date() }).where(eq(agentsTable.id, agent.id));
      await db.insert(activityTable).values({ agentName: agent.name, action: "Detached orchestrator started", detail: runtimeResult.output ?? `Task #${task.id} queued for detached execution`, status: "active" });
      return;
    }
    if (runtimeResult.output) await addTaskMessage(task.id, agent.name, runtimeResult.output);
    const nextStatus = runtimeResult.ok ? "running" : "blocked";
    await db.update(tasksTable).set({ status: nextStatus, approvalRequired: false }).where(eq(tasksTable.id, task.id));
    await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: runtimeResult.ok ? "active" : "error", lastActive: runtimeResult.ok ? "orchestrator response recorded — task remains active until verified" : "runtime failed", lastPing: runtimeResult.ok ? new Date() : agent.lastPing }).where(eq(agentsTable.id, agent.id));
    await db.insert(activityTable).values({ agentName: agent.name, action: runtimeResult.ok ? "Orchestrator response recorded" : "Runtime failed orchestrated work", detail: runtimeResult.output ?? runtimeResult.error, status: runtimeResult.ok ? "pending" : "error" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown runtime dispatch error";
    await db.update(tasksTable).set({ status: "blocked", approvalRequired: false }).where(eq(tasksTable.id, task.id));
    await addTaskMessage(task.id, "Mission Control", `BLOCKED — runtime dispatch failed: ${detail}`);
    await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: "error", lastActive: "runtime dispatch failed" }).where(eq(agentsTable.id, agent.id));
    await db.insert(activityTable).values({ agentName: agent.name, action: "Runtime dispatch failed", detail, status: "error" });
  }
}

router.post("/orchestrator/intake", async (req, res): Promise<void> => {
  const body = req.body as IntakeBody;
  const title = asCleanString(body.title);
  const description = asCleanString(body.description);
  if (!title || !description) { res.status(400).json({ error: "title and description are required" }); return; }
  const project = asCleanString(body.project) ?? DEFAULT_PROJECT;
  const priority = normalizePriority(body.priority);
  const dueDate = asCleanString(body.dueDate);
  const recurrence = asCleanString(body.recurrence) ?? "one_off";
  const attachments = Array.isArray(body.attachments) ? body.attachments.filter((item): item is { name: string; url?: string } => Boolean(item && typeof item === "object" && "name" in item && typeof item.name === "string")) : [];
  const recommendation = await chooseAgent({ title, description, project, priority, requestedAgent: body.requestedAgent, dueDate });
  const assignedAgent = recommendation.agent;
  const assignee = assignedAgent?.name ?? UNASSIGNED_AGENT_NAME;
  const [task] = await db.insert(tasksTable).values({ title, description, project, priority, dueDate, recurrence, approvalRequired: false, attachments, assignee, status: assignedAgent ? "running" : "backlog" }).returning();
  await addTaskMessage(task.id, "Cameron", description);
  await addTaskMessage(task.id, "Mission Control", `Orchestrator intake reviewed. ${recommendation.reason} ${assignedAgent ? `${assignee} now owns this task.` : "Task remains unassigned."}`);
  let command: typeof agentCommandsTable.$inferSelect | null = null;
  let dispatch: { agent: AgentRecord; task: typeof tasksTable.$inferSelect; command: typeof agentCommandsTable.$inferSelect; instructions: string; context: string } | null = null;
  if (assignedAgent) {
    const instructions = buildInstructions({ taskId: task.id, title, description, project, priority, assignee, recommendation });
    const baseContext = JSON.stringify({ source: "orchestrator-intake-v2", orchestrationModel: "owner -> James Hermes -> specialist sub-agents -> James review -> owner final acceptance", recommendation: { recommendedAgent: recommendation.name, role: recommendation.role, department: recommendation.department, reason: recommendation.reason, confidence: recommendation.confidence }, createdBy: "Mission Control Orchestrator" }, null, 2);
    const context = await buildPlaybookContext(baseContext);
    [command] = await db.insert(agentCommandsTable).values({ agentId: assignedAgent.id, taskId: task.id, instructions, context }).returning();
    dispatch = { agent: assignedAgent, task, command, instructions, context };
  }
  await db.insert(activityTable).values({ agentName: "Mission Control", action: assignedAgent ? "Queued work for James Hermes" : "Added work without connected orchestrator", detail: assignedAgent ? `Task #${task.id} assigned to ${assignedAgent.name}. ${recommendation.reason}` : `Task #${task.id} created as unassigned. ${recommendation.reason}`, status: assignedAgent ? "pending" : "idle" });
  res.status(201).json({ accepted: true, task: serializeDates(task), orchestratorReview: { recommendedAgent: recommendation.name, role: recommendation.role, department: recommendation.department, reason: recommendation.reason, confidence: recommendation.confidence }, allocation: assignedAgent && command ? { agentId: assignedAgent.id, agentName: assignedAgent.name, commandId: command.id, delivery: "queued_for_orchestrator", nextStep: "James owns the task and may delegate specialist work. Owner approval is not required for routine execution." } : null });
  if (dispatch) void runAssignedWork(dispatch);
});

export default router;
