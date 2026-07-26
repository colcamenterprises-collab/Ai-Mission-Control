import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tasksTable, agentsTable, agentCommandsTable, activityTable } from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";
import { dispatchRuntime, isRuntimeConfigured } from "../services/agent-runtime.js";
import { formatSkillsForPrompt, readSkillsForDelegation } from "../services/skills.js";

const router: IRouter = Router();
const CORE_PLAYBOOK_CATEGORIES = ["Product", "Standard", "Spec"];

type IntakeBody = { title?: unknown; description?: unknown; project?: unknown; priority?: unknown; requestedAgent?: unknown; dueDate?: unknown };
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

async function buildPlaybookContext(context: string): Promise<string> {
  const playbooks = await readSkillsForDelegation({ categories: CORE_PLAYBOOK_CATEGORIES });
  const playbookContext = formatSkillsForPrompt(playbooks);
  const attachedNames = playbooks.map(playbook => `${playbook.category}: ${playbook.name}`).join("; ");
  return [
    context,
    attachedNames ? `Attached playbooks: ${attachedNames}` : null,
    playbookContext ? `Relevant operating playbooks:\n\n${playbookContext}` : null,
  ].filter(Boolean).join("\n\n");
}

async function chooseAgent(body: Required<Pick<IntakeBody, "title" | "description">> & IntakeBody): Promise<AgentCandidate> {
  const requestedAgent = asCleanString(body.requestedAgent);
  const text = `${body.title} ${body.description} ${asCleanString(body.project) ?? ""}`.toLowerCase();
  const allAgents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  const connectedAgents = allAgents.filter(isRealConnectedAgent);

  if (requestedAgent) {
    const requested = connectedAgents.find((agent) => agent.name.toLowerCase() === requestedAgent.toLowerCase());
    if (requested) return { agent: requested, name: requested.name, role: requested.role, department: requested.department, reason: "Requested connected AI worker matched by name.", confidence: 95 };
    return { agent: null, name: requestedAgent, role: "Requested AI worker", department: "Unassigned", reason: "Requested AI worker is not connected yet. Work was kept in the board until the worker is connected.", confidence: 20 };
  }

  if (!connectedAgents.length) return { agent: null, name: UNASSIGNED_AGENT_NAME, role: "No connected AI worker", department: "Unassigned", reason: "No real connected AI workers exist yet. Work was added to the board but not sent outside Mission Control.", confidence: 0 };

  const routingKeywords = ["code", "repo", "github", "deploy", "bug", "fix", "patch", "react", "api", "database", "typescript", "website", "build", "research", "compare", "market", "source", "verify", "competitor", "data", "latest", "news", "analysis", "write", "document", "markdown", "summary", "copy", "email", "brief", "sop", "proposal", "content", "marketing", "outreach", "campaign", "lead", "client", "ads", "social", "crm", "follow up", "sales", "operations", "report", "stock", "staff", "task", "schedule", "calendar", "customer", "support"];
  const ranked = connectedAgents.map((agent) => ({ agent, score: keywordScore(`${agentSearchText(agent)} ${text}`, routingKeywords) + (agent.isLead ? 1 : 0) + (agent.status === "active" ? 1 : 0) + (isJamesHermes(agent) ? 2 : 0) })).sort((a, b) => b.score - a.score || a.agent.id - b.agent.id);
  const winner = ranked[0];
  const agent = winner.agent;
  return { agent, name: agent.name, role: agent.role, department: agent.department, reason: buildAgentReason(agent, winner.score), confidence: Math.min(90, 58 + winner.score * 4) };
}

function buildInstructions(params: { taskId: number; title: string; description: string; project: string; priority: string; assignee: string; recommendation: AgentCandidate }): string {
  return [`Mission Control assigned task #${params.taskId}: ${params.title}`, "", `Priority: ${params.priority}`, `Project: ${params.project}`, `Assigned AI worker: ${params.assignee}`, `Routing confidence: ${params.recommendation.confidence}%`, `Routing reason: ${params.recommendation.reason}`, "", "Task brief:", params.description, "", "Expected behaviour:", "1. Review the task and attached playbook context.", "2. Identify blockers, required access, and safest next action.", "3. Use only the tools and secrets assigned to your agent token.", "4. Report progress back to Mission Control with task status and playbooks used."].join("\n");
}

router.post("/orchestrator/intake", async (req, res): Promise<void> => {
  const body = req.body as IntakeBody;
  const title = asCleanString(body.title);
  const description = asCleanString(body.description);
  if (!title || !description) { res.status(400).json({ error: "title and description are required", example: { title: "Follow up yesterday's customer enquiries", description: "Review the notes, draft replies, and report anything needing owner approval.", project: "Customer follow-up", priority: "high" } }); return; }

  const project = asCleanString(body.project) ?? DEFAULT_PROJECT;
  const priority = normalizePriority(body.priority);
  const dueDate = asCleanString(body.dueDate);
  const recommendation = await chooseAgent({ title, description, project, priority, requestedAgent: body.requestedAgent, dueDate });
  const assignedAgent = recommendation.agent;
  const assignee = assignedAgent?.name ?? UNASSIGNED_AGENT_NAME;

  const [task] = await db.insert(tasksTable).values({ title, description, project, priority, dueDate, assignee, status: assignedAgent ? "ready" : "backlog" }).returning();
  let command: typeof agentCommandsTable.$inferSelect | null = null;
  let runtimeResult: Awaited<ReturnType<typeof dispatchRuntime>> | null = null;

  if (assignedAgent) {
    const instructions = buildInstructions({ taskId: task.id, title, description, project, priority, assignee, recommendation });
    const baseContext = JSON.stringify({ source: "orchestrator-intake", recommendation: { recommendedAgent: recommendation.name, role: recommendation.role, department: recommendation.department, reason: recommendation.reason, confidence: recommendation.confidence }, createdBy: "Mission Control Orchestrator" }, null, 2);
    const context = await buildPlaybookContext(baseContext);
    [command] = await db.insert(agentCommandsTable).values({ agentId: assignedAgent.id, taskId: task.id, instructions, context }).returning();

    if (isRuntimeConfigured(assignedAgent)) {
      await db.update(tasksTable).set({ status: "running" }).where(eq(tasksTable.id, task.id));
      runtimeResult = await dispatchRuntime(assignedAgent, { mode: "work", instructions, context, taskId: task.id, commandId: command.id });
      await db.update(agentCommandsTable).set({ acknowledgedAt: new Date(), deliveredViaHttp: runtimeResult.ok }).where(eq(agentCommandsTable.id, command.id));
      await db.update(tasksTable).set({ status: runtimeResult.ok ? "review" : "blocked" }).where(eq(tasksTable.id, task.id));
      await db.update(agentsTable).set({ currentTask: runtimeResult.ok ? null : `Task #${task.id}: ${title}`, status: runtimeResult.ok ? (isJamesHermes(assignedAgent) ? "active" : "idle") : "error", lastActive: runtimeResult.ok ? "response received — awaiting review" : "runtime failed", lastPing: runtimeResult.ok ? new Date() : assignedAgent.lastPing }).where(eq(agentsTable.id, assignedAgent.id));
      await db.insert(activityTable).values({ agentName: assignedAgent.name, action: runtimeResult.ok ? "Worker response received — awaiting review" : "Runtime failed orchestrated work", detail: runtimeResult.output ?? runtimeResult.error, status: runtimeResult.ok ? "pending" : "error" });
    } else {
      await db.update(agentsTable).set({ currentTask: `Task #${task.id}: ${title}`, status: "pending", lastActive: "work queued by Mission Control" }).where(eq(agentsTable.id, assignedAgent.id));
    }
  }

  await db.insert(activityTable).values({ agentName: "Mission Control", action: assignedAgent ? (runtimeResult?.ok ? "Routed work — awaiting review" : "Queued work for connected AI worker") : "Added work without connected AI worker", detail: assignedAgent ? `Task #${task.id} assigned to ${assignedAgent.name}. Reason: ${recommendation.reason}` : `Task #${task.id} created as unassigned. Reason: ${recommendation.reason}`, status: runtimeResult?.ok ? "pending" : assignedAgent ? "pending" : "idle" });
  res.status(201).json({ accepted: true, task: serializeDates({ ...task, status: runtimeResult?.ok ? "review" : runtimeResult?.ok === false ? "blocked" : task.status }), orchestratorReview: { recommendedAgent: recommendation.name, role: recommendation.role, department: recommendation.department, reason: recommendation.reason, confidence: recommendation.confidence }, allocation: assignedAgent && command ? { agentId: assignedAgent.id, agentName: assignedAgent.name, commandId: command.id, delivery: runtimeResult?.ok ? "runtime_completed" : "queued_for_agent_ping", nextStep: runtimeResult?.ok ? "The worker response has been received and is waiting for review. Work is not marked complete until the result is checked." : "The assigned AI worker can collect this command through POST /api/agent/ping using its bearer token.", result: runtimeResult?.output ?? null, error: runtimeResult?.error ?? null } : null });
});

export default router;
