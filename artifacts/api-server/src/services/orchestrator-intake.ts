import { and, eq, isNull } from "drizzle-orm";
import { db, tasksTable, agentsTable, agentCommandsTable, activityTable, taskMessagesTable, inboxItemsTable, projectsTable } from "@workspace/db";
import { dispatchRuntime, isRuntimeConfigured } from "./agent-runtime.js";
import { formatSkillsForPrompt, readSkillsForDelegation } from "./skills.js";
import { classifyTaskIntent, humanReadableWorkerOutput, queueJamesCompletionReview } from "./worker-supervision.js";
import { ensureTaskWorkRequest, markTaskExecutionBlocked, markTaskExecutionRunning } from "./task-execution-control.js";

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

function contextKeywords(agent: AgentRecord, taskText: string): string[] {
  return [agent.role, agent.department, agent.responsibilities, taskText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 5)
    .slice(0, 80);
}

async function buildPlaybookContext(context: string, agent: AgentRecord, taskText: string): Promise<string> {
  const playbooks = await readSkillsForDelegation({ categories: CORE_PLAYBOOK_CATEGORIES });
  const keywords = contextKeywords(agent, taskText);
  const scored = playbooks.map(playbook => {
    const haystack = `${playbook.name} ${playbook.title} ${playbook.description ?? ""} ${playbook.content.slice(0, 6000)}`.toLowerCase();
    const score = keywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0)
      + (/worker operating|operating standard|product mission/i.test(`${playbook.name} ${playbook.title}`) ? 3 : 0);
    return { playbook, score };
  }).sort((a, b) => b.score - a.score);
  const selected = scored.filter(item => item.score > 0).slice(0, 4).map(item => item.playbook);
  const playbookContext = formatSkillsForPrompt(selected);
  const attachedNames = selected.map(playbook => `${playbook.category}: ${playbook.name}`).join("; ");
  return [context, attachedNames ? `Role/task scoped playbooks: ${attachedNames}` : "No additional playbook was relevant enough to inject for this task.", playbookContext ? `Relevant operating playbooks:\n\n${playbookContext}` : null].filter(Boolean).join("\n\n");
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
  const routingKeywords = ["code", "repo", "github", "deploy", "bug", "fix", "patch", "react", "api", "database", "typescript", "website", "build", "research", "compare", "market", "source", "verify", "competitor", "data", "latest", "news", "analysis", "write", "document", "markdown", "summary", "copy", "email", "brief", "sop", "proposal", "content", "marketing", "outreach", "campaign", "lead", "client", "ads", "social", "crm", "follow up", "sales", "operations", "report", "stock", "staff", "task", "schedule", "calendar", "customer", "support", "finance", "reconcile", "bank", "expense", "cash"];
  const ranked = connectedAgents.map(agent => ({ agent, score: keywordScore(`${agentSearchText(agent)} ${text}`, routingKeywords) + (agent.isLead ? 1 : 0) + (agent.status === "active" ? 1 : 0) + (isJamesHermes(agent) ? 2 : 0) })).sort((a, b) => b.score - a.score || a.agent.id - b.agent.id);
  const winner = ranked[0];
  const agent = winner.agent;
  return { agent, name: agent.name, role: agent.role, department: agent.department, reason: buildAgentReason(agent, winner.score), confidence: Math.min(90, 58 + winner.score * 4) };
}

function buildInstructions(params: { taskId: number; title: string; description: string; project: string; priority: string; assignee: string; recommendation: AgentCandidate }): string {
  const classification = classifyTaskIntent(params.title, params.description);
  const proportionalRule = classification.intent === "acknowledgement_test"
    ? "This is a trivial acknowledgement/allocation test. Do not perform operational work, browse unrelated context, make readiness claims, or produce a long report. Confirm receipt/allocation and state that no action was taken."
    : "Keep the response proportional to the task. Material claims require evidence; distinguish verified facts, calculations, assumptions and unknowns where relevant.";
  return [`Mission Control assigned task #${params.taskId}: ${params.title}`, "", `Priority: ${params.priority}`, `Project: ${params.project}`, `Assigned AI worker: ${params.assignee}`, `Task intent: ${classification.intent}`, `Task complexity: ${classification.complexity}`, `Routing confidence: ${params.recommendation.confidence}%`, `Routing reason: ${params.recommendation.reason}`, "", "Task brief:", params.description, "", "Operating rules:", "1. The owner brief is authoritative.", `2. ${proportionalRule}`, "3. Keep task-specific questions, findings, actions and results inside the Mission Control task conversation.", "4. Identify blockers, required access, and safest next action.", "5. If protected-action approval is required, state exactly what requires approval and do not cross that gate.", "6. Use only role/task relevant tools, memory, knowledge and playbooks.", "7. Never claim work, evidence, access, readiness or completion you did not verify.", "8. Your completion claim is provisional. James Hermes independently reviews specialist work before Review or Done."].join("\n");
}

async function runAssignedWork(params: { agent: AgentRecord; task: typeof tasksTable.$inferSelect; command: typeof agentCommandsTable.$inferSelect; instructions: string; context: string }): Promise<void> {
  const { agent, task, command, instructions, context } = params;
  if (!isRuntimeConfigured(agent)) {
    await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: "pending", lastActive: "work queued by Mission Control" }).where(eq(agentsTable.id, agent.id));
    await addTaskMessage(task.id, "Mission Control", `${agent.name} has been allocated this task. Work is queued for agent pickup.`);
    return;
  }
  try {
    const classification = classifyTaskIntent(task.title, task.description ?? "");
    await markTaskExecutionRunning(task.id);
    await db.update(tasksTable).set({ status: "running" }).where(eq(tasksTable.id, task.id));
    await addTaskMessage(task.id, agent.name, classification.intent === "acknowledgement_test" ? "Task received. Allocation confirmed; no work is requested." : "Task received. I am reviewing the assigned brief and relevant evidence.");
    const runtimeResult = await dispatchRuntime(agent, { mode: "work", instructions, context, taskId: task.id, commandId: command.id });
    await db.update(agentCommandsTable).set({ acknowledgedAt: new Date(), deliveredViaHttp: runtimeResult.ok }).where(eq(agentCommandsTable.id, command.id));
    if (runtimeResult.delivery === "queued" && runtimeResult.ok) {
      await db.update(tasksTable).set({ status: "running" }).where(eq(tasksTable.id, task.id));
      await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: "active", lastActive: "detached task running", lastPing: new Date() }).where(eq(agentsTable.id, agent.id));
      await db.insert(activityTable).values({ agentName: agent.name, action: "Detached worker started", detail: runtimeResult.output ?? `Task #${task.id} queued for detached execution`, status: "active" });
      return;
    }
    if (!runtimeResult.ok) {
      const reason = runtimeResult.error ?? "agent runtime failed";
      await markTaskExecutionBlocked(task.id, reason);
      await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, task.id));
      await addTaskMessage(task.id, "Mission Control", `BLOCKED — ${reason}`);
      await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: "error", lastActive: "runtime failed" }).where(eq(agentsTable.id, agent.id));
      await db.insert(activityTable).values({ agentName: agent.name, action: "Runtime failed orchestrated work", detail: runtimeResult.error, status: "error" });
      return;
    }
    const visible = humanReadableWorkerOutput(runtimeResult.output);
    if (visible) await addTaskMessage(task.id, agent.name, visible);
    await db.update(tasksTable).set({ status: "completion_pending" }).where(eq(tasksTable.id, task.id));
    await addTaskMessage(task.id, "Mission Control", "AGENT REPORTED COMPLETE — James supervisory verification is required before Review or Done.");
    await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${task.title}`, status: "active", lastActive: "response received — awaiting James QA", lastPing: new Date() }).where(eq(agentsTable.id, agent.id));
    await db.insert(activityTable).values({ agentName: agent.name, action: "Worker response recorded; James QA pending", detail: runtimeResult.output, status: "pending" });
    await queueJamesCompletionReview(task.id, agent.name, runtimeResult.output);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown runtime dispatch error";
    await markTaskExecutionBlocked(task.id, detail);
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
    const classification = classifyTaskIntent(title, description);
    await tx.insert(taskMessagesTable).values({ taskId: task.id, author: "Cameron", body: description });
    await tx.insert(taskMessagesTable).values({ taskId: task.id, author: "Mission Control", body: `Orchestrator reviewed the task. ${recommendation.reason} ${assignedAgent ? `Allocated to ${assignee}.` : "Task remains unassigned."} Intent: ${classification.intent}; complexity: ${classification.complexity}.` });
    let command: typeof agentCommandsTable.$inferSelect | null = null;
    if (assignedAgent) {
      const instructions = buildInstructions({ taskId: task.id, title, description, project, priority, assignee, recommendation });
      const baseContext = JSON.stringify({ source: inboxItem ? "inbox-promotion" : "orchestrator-intake", inboxItemId: inboxItem?.id ?? null, taskClassification: classification, recommendation: { recommendedAgent: recommendation.name, role: recommendation.role, department: recommendation.department, reason: recommendation.reason, confidence: recommendation.confidence }, createdBy: "Mission Control Orchestrator" }, null, 2);
      const context = await buildPlaybookContext(baseContext, assignedAgent, `${title} ${description} ${project}`);
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
      allocation: assignedAgent && command ? { agentId: assignedAgent.id, agentName: assignedAgent.name, commandId: command.id, delivery: "queued_for_worker", nextStep: "Work has been queued. Specialist completion will be independently reviewed by James before Review or Done." } : null,
    };
  });
  await ensureTaskWorkRequest({
    task: result.task,
    agentId: result.allocation?.agentId ?? null,
    routingReason: result.orchestratorReview?.reason ?? "Canonical orchestrator intake",
  });
  if (dispatch) void runAssignedWork(dispatch);
  return result;
}
