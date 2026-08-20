import { and, eq, isNull } from "drizzle-orm";
import { db, tasksTable, agentsTable, agentCommandsTable, activityTable, taskMessagesTable, inboxItemsTable, projectsTable } from "@workspace/db";
import { dispatchRuntime, isRuntimeConfigured } from "./agent-runtime.js";
import { formatSkillsForPrompt, readSkillsForDelegation } from "./skills.js";

const CORE_PLAYBOOK_CATEGORIES = ["Product", "Standard", "Spec"];
type IntakeBody = { title?: unknown; description?: unknown; project?: unknown; priority?: unknown; requestedAgent?: unknown; dueDate?: unknown; recurrence?: unknown; approvalRequired?: unknown; ownerReviewRequired?: unknown; attachments?: unknown };
type AgentRecord = typeof agentsTable.$inferSelect;
type AgentCandidate = { agent: AgentRecord | null; name: string; role: string; department: string; reason: string; confidence: number };
const DEFAULT_PROJECT = "Mission Control";
const DEFAULT_PRIORITY = "medium";
const UNASSIGNED_AGENT_NAME = "Unassigned";

function asCleanString(value: unknown): string | null { if (typeof value !== "string") return null; const trimmed = value.trim(); return trimmed.length ? trimmed : null; }
function normalizePriority(value: unknown): string { const priority = asCleanString(value)?.toLowerCase(); if (["low", "medium", "high", "critical"].includes(priority ?? "")) return priority!; return DEFAULT_PRIORITY; }
function keywordScore(text: string, keywords: string[]): number { const haystack = text.toLowerCase(); return keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0); }
function isRealConnectedAgent(agent: AgentRecord): boolean { return Boolean(agent.isPluggedIn || agent.endpoint || agent.inboundToken || (agent.provider && agent.model)); }
function isJamesHermes(agent: AgentRecord): boolean { return agent.provider === "hermes" || agent.name.toLowerCase().includes("james hermes"); }
function agentSearchText(agent: AgentRecord): string { return [agent.name, agent.role, agent.department, agent.responsibilities, agent.provider, agent.model].filter(Boolean).join(" ").toLowerCase(); }
function buildAgentReason(agent: AgentRecord, score: number): string { if (score > 0) return "Best matching connected AI worker for this work brief."; if (agent.isLead) return "Lead connected AI worker selected because no specialist matched strongly."; return "Connected AI worker selected for review and routing."; }

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

async function chooseAgent(body: Required<Pick<IntakeBody, "title" | "description">> & IntakeBody): Promise<AgentCandidate> {
  const requestedAgent = asCleanString(body.requestedAgent);
  const text = `${body.title} ${body.description} ${asCleanString(body.project) ?? ""}`.toLowerCase();
  const allAgents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  const connectedAgents = allAgents.filter(isRealConnectedAgent);
  if (requestedAgent) {
    const requested = connectedAgents.find(agent => agent.name.toLowerCase() === requestedAgent.toLowerCase());
    if (requested) return { agent: requested, name: requested.name, role: requested.role, department: requested.department, reason: "Requested connected AI worker matched by name.", confidence: 95 };
    return { agent: null, name: requestedAgent, role: "Requested AI worker", department: "Unassigned", reason: "Requested AI worker is not connected yet. Work was kept in the board until the worker is connected.", confidence: 20 };
  }
  if (!connectedAgents.length) return { agent: null, name: UNASSIGNED_AGENT_NAME, role: "No connected AI worker", department: "Unassigned", reason: "No real connected AI workers exist yet. Work was added to the board but not sent outside Mission Control.", confidence: 0 };
  const routingKeywords = ["code", "repo", "github", "deploy", "bug", "fix", "patch", "react", "api", "database", "typescript", "website", "build", "research", "compare", "market", "source", "verify", "competitor", "data", "latest", "news", "analysis", "write", "document", "markdown", "summary", "copy", "email", "brief", "sop", "proposal", "content", "marketing", "outreach", "campaign", "lead", "client", "ads", "social", "crm", "follow up", "sales", "operations", "report", "stock", "staff", "task", "schedule", "calendar", "customer", "support"];
  const ranked = connectedAgents.map(agent => ({ agent, score: keywordScore(`${agentSearchText(agent)} ${text}`, routingKeywords) + (agent.isLead ? 1 : 0) + (agent.status === "active" ? 1 : 0) + (isJamesHermes(agent) ? 2 : 0) })).sort((a, b) => b.score - a.score || a.agent.id - b.agent.id);
  const winner = ranked[0];
  const agent = winner.agent;
  return { agent, name: agent.name, role: agent.role, department: agent.department, reason: buildAgentReason(agent, winner.score), confidence: Math.min(90, 58 + winner.score * 4) };
}

function buildInstructions(params: { taskId: number; title: string; description: string; project: string; priority: string; assignee: string; recommendation: AgentCandidate }): string {
  return [`Mission Control assigned task #${params.taskId}: ${params.title}`, "", `Priority: ${params.priority}`, `Project: ${params.project}`, `Assigned AI worker: ${params.assignee}`, `Routing confidence: ${params.recommendation.confidence}%`, `Routing reason: ${params.recommendation.reason}`, "", "Task brief:", params.description, "", "Operating rules:", "1. Review the task and attached playbook context.", "2. Keep every task-specific question, finding, action and result inside the Mission Control task conversation.", "3. Identify blockers, required access, and safest next action.", "4. If owner approval is required, clearly state what needs approval and why; do not continue past that approval gate.", "5. Use only the tools and secrets assigned to your agent token.", "6. Report progress and completion back to Mission Control. Never claim work you did not perform."].join("\n");
}

async function runAssignedWork(params: { agent: AgentRecord; task: typeof tasksTable.$inferSelect; command: typeof agentCommandsTable.$inferSelect; instructions: string; context: string }): Promise<void> {
  const { agent, task, command, instructions, context } = params;
  if (!isRuntimeConfigured(agent)) {
    await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: "pending", lastActive: "work queued by Mission Control" }).where(eq(agentsTable.id, agent.id));
    await addTaskMessage(task.id, "Mission Control", `${agent.name} has been allocated this task. Work is queued for agent pickup.`);
    return;
  }
  try {
    await db.update(tasksTable).set({ status: "running" }).where(eq(tasksTable.id, task.id));
    await addTaskMessage(task.id, agent.name, "Task received. I am reviewing the brief and beginning work.");
    const runtimeResult = await dispatchRuntime(agent, { mode: "work", instructions, context, taskId: task.id, commandId: command.id });
    await db.update(agentCommandsTable).set({ acknowledgedAt: new Date(), deliveredViaHttp: runtimeResult.ok }).where(eq(agentCommandsTable.id, command.id));
    if (runtimeResult.delivery === "queued" && runtimeResult.ok) {
      await db.update(tasksTable).set({ status: "running" }).where(eq(tasksTable.id, task.id));
      await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: "active", lastActive: "detached task running", lastPing: new Date() }).where(eq(agentsTable.id, agent.id));
      await db.insert(activityTable).values({ agentName: agent.name, action: "Detached worker started", detail: runtimeResult.output ?? `Task #${task.id} queued for detached execution`, status: "active" });
      return;
    }
    if (runtimeResult.output) await addTaskMessage(task.id, agent.name, runtimeResult.output);
    const nextStatus = runtimeResult.ok ? (task.approvalRequired ? "review" : "running") : "blocked";
    await db.update(tasksTable).set({ status: nextStatus }).where(eq(tasksTable.id, task.id));
    if (task.approvalRequired && runtimeResult.ok) await addTaskMessage(task.id, "Mission Control", "OWNER APPROVAL REQUIRED — review the agent notes above, then approve or request changes from this task.");
    await db.update(agentsTable).set({ currentTask: runtimeResult.ok ? (task.approvalRequired ? null : `Task #${task.id}: ${task.title}`) : `Task #${task.id}: ${task.title}`, status: runtimeResult.ok ? "active" : "error", lastActive: runtimeResult.ok ? (task.approvalRequired ? "response received — awaiting owner approval" : "task active — response recorded") : "runtime failed", lastPing: runtimeResult.ok ? new Date() : agent.lastPing }).where(eq(agentsTable.id, agent.id));
    await db.insert(activityTable).values({ agentName: agent.name, action: runtimeResult.ok ? "Worker response recorded in task" : "Runtime failed orchestrated work", detail: runtimeResult.output ?? runtimeResult.error, status: runtimeResult.ok ? "pending" : "error" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown runtime dispatch error";
    await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, task.id));
    await addTaskMessage(task.id, "Mission Control", `BLOCKED — runtime dispatch failed: ${detail}`);
    await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: "error", lastActive: "runtime dispatch failed" }).where(eq(agentsTable.id, agent.id));
    await db.insert(activityTable).values({ agentName: agent.name, action: "Runtime dispatch failed", detail, status: "error" });
  }
}


export class IntakeValidationError extends Error {}

export type IntakeResult = {
  created: boolean;
  duplicatePrevented: boolean;
  task: typeof tasksTable.$inferSelect;
  orchestratorReview: { recommendedAgent: string; role: string; department: string; reason: string; confidence: number } | null;
  allocation: { agentId: number; agentName: string; commandId: number; delivery: "queued_for_worker"; nextStep: string } | null;
};

/**
 * The single canonical actionable-task intake service. Both direct Task creation
 * and Inbox promotion use this function, so routing, allocation, playbooks,
 * timeline records and dispatch cannot drift into separate implementations.
 */
export async function intakeActionableTask(body: IntakeBody, options: { inboxItemId?: number } = {}): Promise<IntakeResult> {
  let dispatch: { agent: AgentRecord; task: typeof tasksTable.$inferSelect; command: typeof agentCommandsTable.$inferSelect; instructions: string; context: string } | null = null;
  const result = await db.transaction(async (tx): Promise<IntakeResult> => {
    let inboxItem: typeof inboxItemsTable.$inferSelect | null = null;
    if (options.inboxItemId !== undefined) {
      const [stored] = await tx.select().from(inboxItemsTable)
        .where(and(eq(inboxItemsTable.id, options.inboxItemId), isNull(inboxItemsTable.archivedAt)))
        .for("update");
      if (!stored) throw new IntakeValidationError("Inbox item not found");
      if (stored.linkedTaskId) {
        const [existingTask] = await tx.select().from(tasksTable).where(eq(tasksTable.id, stored.linkedTaskId));
        if (!existingTask) throw new IntakeValidationError("Linked Task not found");
        return { created: false, duplicatePrevented: true, task: existingTask, orchestratorReview: null, allocation: null };
      }
      inboxItem = stored;
      body = {
        ...body,
        title: asCleanString(body.title) ?? stored.title ?? stored.content.slice(0, 100),
        description: stored.content,
        approvalRequired: false,
        ownerReviewRequired: false,
      };
      if (!asCleanString(body.project) && stored.linkedProjectId) {
        const [project] = await tx.select().from(projectsTable).where(eq(projectsTable.id, stored.linkedProjectId));
        if (project) body.project = project.name;
      }
    }

    const title = asCleanString(body.title);
    const description = asCleanString(body.description);
    if (!title || !description) throw new IntakeValidationError("title and description are required");
    const project = asCleanString(body.project) ?? DEFAULT_PROJECT;
    const priority = normalizePriority(body.priority);
    const dueDate = asCleanString(body.dueDate);
    const recurrence = asCleanString(body.recurrence) ?? "one_off";
    const approvalRequired = body.approvalRequired === true;
    const ownerReviewRequired = body.ownerReviewRequired === true;
    const attachments = Array.isArray(body.attachments) ? body.attachments.filter((item): item is { name: string; url?: string } => Boolean(item && typeof item === "object" && "name" in item && typeof item.name === "string")) : [];
    const recommendation = await chooseAgent({ title, description, project, priority, requestedAgent: body.requestedAgent, dueDate });
    const assignedAgent = recommendation.agent;
    const assignee = assignedAgent?.name ?? UNASSIGNED_AGENT_NAME;
    const [task] = await tx.insert(tasksTable).values({ title, description, project, priority, dueDate, recurrence, approvalRequired, ownerReviewRequired, attachments, assignee, status: assignedAgent ? "ready" : "backlog" }).returning();
    await tx.insert(taskMessagesTable).values({ taskId: task.id, author: "Cameron", body: description });
    await tx.insert(taskMessagesTable).values({ taskId: task.id, author: "Mission Control", body: `Orchestrator reviewed the task. ${recommendation.reason} ${assignedAgent ? `Allocated to ${assignee}.` : "Task remains unassigned."}` });
    let command: typeof agentCommandsTable.$inferSelect | null = null;
    if (assignedAgent) {
      const instructions = buildInstructions({ taskId: task.id, title, description, project, priority, assignee, recommendation });
      const baseContext = JSON.stringify({ source: inboxItem ? "inbox-promotion" : "orchestrator-intake", inboxItemId: inboxItem?.id ?? null, recommendation: { recommendedAgent: recommendation.name, role: recommendation.role, department: recommendation.department, reason: recommendation.reason, confidence: recommendation.confidence }, createdBy: "Mission Control Orchestrator" }, null, 2);
      const context = await buildPlaybookContext(baseContext);
      [command] = await tx.insert(agentCommandsTable).values({ agentId: assignedAgent.id, taskId: task.id, instructions, context }).returning();
      dispatch = { agent: assignedAgent, task, command, instructions, context };
    }
    await tx.insert(activityTable).values({ agentName: "Mission Control", action: assignedAgent ? "Queued work for AI worker" : "Added work without connected AI worker", detail: assignedAgent ? `Task #${task.id} assigned to ${assignedAgent.name}. Reason: ${recommendation.reason}` : `Task #${task.id} created as unassigned. Reason: ${recommendation.reason}`, status: assignedAgent ? "pending" : "idle" });
    if (inboxItem) await tx.update(inboxItemsTable).set({ linkedTaskId: task.id, reviewStatus: "promoted", reviewedAt: new Date(), updatedAt: new Date() }).where(eq(inboxItemsTable.id, inboxItem.id));
    return {
      created: true,
      duplicatePrevented: false,
      task,
      orchestratorReview: { recommendedAgent: recommendation.name, role: recommendation.role, department: recommendation.department, reason: recommendation.reason, confidence: recommendation.confidence },
      allocation: assignedAgent && command ? { agentId: assignedAgent.id, agentName: assignedAgent.name, commandId: command.id, delivery: "queued_for_worker", nextStep: "Work has been queued. All worker responses will be recorded inside this task." } : null,
    };
  });
  if (dispatch) void runAssignedWork(dispatch);
  return result;
}
