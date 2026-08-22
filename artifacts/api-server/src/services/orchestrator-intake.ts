import { and, eq, isNull } from "drizzle-orm";
import {
  activityTable,
  agentsTable,
  db,
  inboxItemsTable,
  projectsTable,
  taskMessagesTable,
  tasksTable,
} from "@workspace/db";
import { createGovernedWorkRequest } from "./governed-work.js";

type IntakeBody = {
  title?: unknown;
  description?: unknown;
  project?: unknown;
  priority?: unknown;
  requestedAgent?: unknown;
  dueDate?: unknown;
  recurrence?: unknown;
  approvalRequired?: unknown;
  ownerReviewRequired?: unknown;
  attachments?: unknown;
};
type AgentRecord = typeof agentsTable.$inferSelect;
type AgentCandidate = {
  agent: AgentRecord | null;
  name: string;
  role: string;
  department: string;
  reason: string;
  confidence: number;
};
const DEFAULT_PROJECT = "Mission Control";
const DEFAULT_PRIORITY = "medium";
const UNASSIGNED_AGENT_NAME = "Unassigned";

function asCleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
function normalizePriority(value: unknown): string {
  const priority = asCleanString(value)?.toLowerCase();
  return ["low", "medium", "high", "critical", "urgent"].includes(priority ?? "")
    ? priority!
    : DEFAULT_PRIORITY;
}
function keywordScore(text: string, keywords: string[]): number {
  const haystack = text.toLowerCase();
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
}
function isRealConnectedAgent(agent: AgentRecord): boolean {
  return Boolean(agent.isPluggedIn || agent.endpoint || agent.inboundToken || (agent.provider && agent.model));
}
function agentSearchText(agent: AgentRecord): string {
  return [agent.name, agent.role, agent.department, agent.responsibilities, agent.provider, agent.model]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function chooseAgent(body: Required<Pick<IntakeBody, "title" | "description">> & IntakeBody): Promise<AgentCandidate> {
  const requestedAgent = asCleanString(body.requestedAgent);
  const text = `${body.title} ${body.description} ${asCleanString(body.project) ?? ""}`.toLowerCase();
  const allAgents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  const connectedAgents = allAgents.filter(isRealConnectedAgent);
  if (requestedAgent) {
    const requested = connectedAgents.find((agent) => agent.name.toLowerCase() === requestedAgent.toLowerCase());
    if (requested) return { agent: requested, name: requested.name, role: requested.role, department: requested.department, reason: "Requested connected worker matched explicitly.", confidence: 95 };
    return { agent: null, name: requestedAgent, role: "Requested AI worker", department: "Unassigned", reason: "Requested worker is not connected. Work remains governed and blocked until an eligible worker is assigned.", confidence: 20 };
  }
  if (!connectedAgents.length) return { agent: null, name: UNASSIGNED_AGENT_NAME, role: "No connected AI worker", department: "Unassigned", reason: "No connected workers exist. Work remains governed and blocked.", confidence: 0 };
  const routingKeywords = ["code", "repo", "github", "deploy", "bug", "fix", "react", "api", "database", "website", "research", "market", "data", "analysis", "write", "document", "email", "marketing", "sales", "operations", "report", "schedule", "calendar", "customer", "support"];
  const ranked = connectedAgents
    .map((agent) => ({ agent, score: keywordScore(`${agentSearchText(agent)} ${text}`, routingKeywords) + (agent.isLead ? 1 : 0) + (agent.status === "active" ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.agent.id - b.agent.id);
  const winner = ranked[0];
  return {
    agent: winner.agent,
    name: winner.agent.name,
    role: winner.agent.role,
    department: winner.agent.department,
    reason: winner.score > 0 ? "Best capability match among connected workers." : "Connected lead worker selected because no specialist matched strongly.",
    confidence: Math.min(90, 58 + winner.score * 4),
  };
}

export class IntakeValidationError extends Error {}

export type IntakeResult = {
  created: boolean;
  duplicatePrevented: boolean;
  task: typeof tasksTable.$inferSelect;
  orchestratorReview: { recommendedAgent: string; role: string; department: string; reason: string; confidence: number } | null;
  allocation: { agentId: number; agentName: string; requestId: number; delivery: "governed_work_request"; nextStep: string } | null;
};

export async function intakeActionableTask(body: IntakeBody, options: { inboxItemId?: number } = {}): Promise<IntakeResult> {
  let inboxItem: typeof inboxItemsTable.$inferSelect | null = null;
  if (options.inboxItemId !== undefined) {
    const [stored] = await db.select().from(inboxItemsTable).where(and(eq(inboxItemsTable.id, options.inboxItemId), isNull(inboxItemsTable.archivedAt)));
    if (!stored) throw new IntakeValidationError("Inbox item not found");
    if (stored.linkedTaskId) {
      const [existingTask] = await db.select().from(tasksTable).where(eq(tasksTable.id, stored.linkedTaskId));
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
      const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, stored.linkedProjectId));
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
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.filter((item): item is { name: string; url?: string } => Boolean(item && typeof item === "object" && "name" in item && typeof item.name === "string"))
    : [];
  const recommendation = await chooseAgent({ title, description, project, priority, requestedAgent: body.requestedAgent, dueDate });
  const assignedAgent = recommendation.agent;
  const assignee = assignedAgent?.name ?? UNASSIGNED_AGENT_NAME;

  const task = await db.transaction(async (tx) => {
    const [created] = await tx.insert(tasksTable).values({
      title,
      description,
      project,
      priority,
      dueDate,
      recurrence,
      approvalRequired,
      ownerReviewRequired,
      attachments,
      assignee,
      status: assignedAgent ? "ready" : "backlog",
    }).returning();
    await tx.insert(taskMessagesTable).values({ taskId: created.id, author: "Cameron", body: description });
    await tx.insert(taskMessagesTable).values({ taskId: created.id, author: "Mission Control", body: `Canonical intake reviewed the task. ${recommendation.reason} ${assignedAgent ? `Allocated to ${assignee}.` : "Task remains unassigned."}` });
    if (inboxItem) await tx.update(inboxItemsTable).set({ linkedTaskId: created.id, reviewStatus: "promoted", reviewedAt: new Date(), updatedAt: new Date() }).where(eq(inboxItemsTable.id, inboxItem.id));
    return created;
  });

  const request = await createGovernedWorkRequest({
    taskId: task.id,
    agentId: assignedAgent?.id ?? null,
    requestedAction: `Complete task #${task.id}: ${title}\n\n${description}`,
    project,
    routingReason: recommendation.reason,
    riskLevel: approvalRequired ? 3 : 1,
    approvalReason: approvalRequired ? "Task explicitly requires owner approval before execution." : null,
  });

  const taskStatus = request.state === "blocked" ? "blocked" : request.state === "awaiting_approval" ? "review" : "ready";
  await db.update(tasksTable).set({ status: taskStatus }).where(eq(tasksTable.id, task.id));
  await db.insert(activityTable).values({
    agentName: "Mission Control",
    action: "Created governed work request",
    detail: `Task #${task.id} -> work request #${request.id} (${request.state})`,
    status: request.state === "blocked" ? "error" : "pending",
  });
  if (request.state === "awaiting_approval") await db.insert(taskMessagesTable).values({ taskId: task.id, author: "Mission Control", body: `OWNER APPROVAL REQUIRED — governed work request #${request.id} is awaiting approval.` });

  const [updatedTask] = await db.select().from(tasksTable).where(eq(tasksTable.id, task.id));
  return {
    created: true,
    duplicatePrevented: false,
    task: updatedTask,
    orchestratorReview: { recommendedAgent: recommendation.name, role: recommendation.role, department: recommendation.department, reason: recommendation.reason, confidence: recommendation.confidence },
    allocation: assignedAgent ? { agentId: assignedAgent.id, agentName: assignedAgent.name, requestId: request.id, delivery: "governed_work_request", nextStep: request.state === "awaiting_approval" ? "Await owner approval." : request.state === "approved" ? "Worker may claim the governed request." : "Review the blocked request." } : null,
  };
}
