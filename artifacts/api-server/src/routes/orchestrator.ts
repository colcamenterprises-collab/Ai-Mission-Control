import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  tasksTable,
  agentsTable,
  agentCommandsTable,
  activityTable,
} from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";
import { OPERATIONAL_AGENTS } from "../config-operational-agents.js";

const router: IRouter = Router();

type IntakeBody = {
  title?: unknown;
  description?: unknown;
  project?: unknown;
  priority?: unknown;
  requestedAgent?: unknown;
  dueDate?: unknown;
};

type AgentCandidate = {
  name: string;
  role: string;
  department: string;
  reason: string;
  confidence: number;
};

const DEFAULT_PROJECT = "Mission Control";
const DEFAULT_PRIORITY = "medium";

function asCleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizePriority(value: unknown): string {
  const priority = asCleanString(value)?.toLowerCase();
  if (["low", "medium", "high", "critical"].includes(priority ?? "")) {
    return priority!;
  }
  return DEFAULT_PRIORITY;
}

function keywordScore(text: string, keywords: string[]): number {
  const haystack = text.toLowerCase();
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
}

function chooseAgent(body: Required<Pick<IntakeBody, "title" | "description">> & IntakeBody): AgentCandidate {
  const requestedAgent = asCleanString(body.requestedAgent);
  const text = `${body.title} ${body.description} ${asCleanString(body.project) ?? ""}`.toLowerCase();

  if (requestedAgent) {
    const configured = OPERATIONAL_AGENTS.find((agent) => agent.name.toLowerCase() === requestedAgent.toLowerCase());
    return {
      name: configured?.name ?? requestedAgent,
      role: configured?.role ?? "Requested agent",
      department: configured?.department ?? "Operators",
      reason: "Explicitly requested in the intake payload.",
      confidence: 95,
    };
  }

  const candidates: Array<AgentCandidate & { keywords: string[] }> = [
    {
      name: "Dev/Codex",
      role: "Build agent",
      department: "Developers",
      keywords: ["code", "repo", "github", "deploy", "bug", "fix", "patch", "react", "api", "database", "typescript", "website", "build"],
      reason: "Task appears to require coding, repository, deployment, API, or debugging work.",
      confidence: 80,
    },
    {
      name: "Scout",
      role: "Research",
      department: "Researchers",
      keywords: ["research", "compare", "market", "source", "verify", "competitor", "data", "latest", "news", "analysis"],
      reason: "Task appears to require research, source checking, comparison, or data gathering.",
      confidence: 78,
    },
    {
      name: "Scribe",
      role: "Documentation/content",
      department: "Writers",
      keywords: ["write", "document", "markdown", "summary", "copy", "email", "brief", "sop", "lyrics", "proposal", "content"],
      reason: "Task appears to require writing, documentation, summaries, or structured communication.",
      confidence: 76,
    },
    {
      name: "Reach",
      role: "Marketing/outreach",
      department: "Operators",
      keywords: ["marketing", "outreach", "campaign", "lead", "client", "ads", "social", "crm", "follow up", "sales"],
      reason: "Task appears to require marketing, outreach, lead management, or client follow-up.",
      confidence: 74,
    },
  ];

  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: keywordScore(text, candidate.keywords) }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0];
  if (winner && winner.score > 0) {
    return {
      name: winner.name,
      role: winner.role,
      department: winner.department,
      reason: winner.reason,
      confidence: Math.min(95, winner.confidence + winner.score * 3),
    };
  }

  return {
    name: "James",
    role: "Orchestrator",
    department: "Operators",
    reason: "No specialist signal was strong enough, so the task remains with the orchestrator for review and routing.",
    confidence: 70,
  };
}

async function ensureAgent(candidate: AgentCandidate) {
  const [existing] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.name, candidate.name));

  if (existing) return existing;

  const configured = OPERATIONAL_AGENTS.find((agent) => agent.name === candidate.name);
  const [created] = await db
    .insert(agentsTable)
    .values({
      name: candidate.name,
      role: configured?.role ?? candidate.role,
      department: configured?.department ?? candidate.department,
      isLead: configured?.isLead ?? candidate.name === "James",
      status: "idle",
      currentTask: null,
      lastActive: "created by orchestrator intake",
      responsibilities: configured?.responsibilities ?? candidate.reason,
      avatarInitials: configured?.avatarInitials ?? candidate.name.slice(0, 2).toUpperCase(),
      tasksCompleted: 0,
      successRate: 100,
      isPluggedIn: configured?.isPluggedIn ?? false,
      provider: configured?.provider ?? null,
      model: configured?.model ?? null,
      apiKey: null,
      endpoint: null,
      inboundToken: null,
      lastPing: null,
    })
    .returning();

  return created;
}

function buildInstructions(params: {
  taskId: number;
  title: string;
  description: string;
  project: string;
  priority: string;
  assignee: string;
  recommendation: AgentCandidate;
}): string {
  return [
    `Mission Control assigned task #${params.taskId}: ${params.title}`,
    "",
    `Priority: ${params.priority}`,
    `Project: ${params.project}`,
    `Assigned agent: ${params.assignee}`,
    `Recommendation confidence: ${params.recommendation.confidence}%`,
    `Routing reason: ${params.recommendation.reason}`,
    "",
    "Task brief:",
    params.description,
    "",
    "Expected behaviour:",
    "1. Review the task and available context.",
    "2. Identify blockers, required access, and safest next action.",
    "3. Recommend an execution plan before making risky changes.",
    "4. Report progress back to Mission Control with task status.",
  ].join("\n");
}

router.post("/orchestrator/intake", async (req, res): Promise<void> => {
  const body = req.body as IntakeBody;
  const title = asCleanString(body.title);
  const description = asCleanString(body.description);

  if (!title || !description) {
    res.status(400).json({
      error: "title and description are required",
      example: {
        title: "Fix HHA website mobile hero",
        description: "Review the mobile layout and recommend the safest patch.",
        project: "HHA",
        priority: "high",
      },
    });
    return;
  }

  const project = asCleanString(body.project) ?? DEFAULT_PROJECT;
  const priority = normalizePriority(body.priority);
  const dueDate = asCleanString(body.dueDate);
  const recommendation = chooseAgent({ title, description, project, priority, requestedAgent: body.requestedAgent, dueDate });
  const agent = await ensureAgent(recommendation);

  const [task] = await db
    .insert(tasksTable)
    .values({
      title,
      description,
      project,
      priority,
      dueDate,
      assignee: agent.name,
      status: "assigned",
    })
    .returning();

  const instructions = buildInstructions({
    taskId: task.id,
    title,
    description,
    project,
    priority,
    assignee: agent.name,
    recommendation,
  });

  const [command] = await db
    .insert(agentCommandsTable)
    .values({
      agentId: agent.id,
      taskId: task.id,
      instructions,
      context: JSON.stringify({
        source: "orchestrator-intake",
        recommendation,
        createdBy: "Mission Control Orchestrator MVP",
      }, null, 2),
    })
    .returning();

  await db.insert(activityTable).values({
    agentName: "Mission Control",
    action: "Orchestrator intake allocated task",
    detail: `Task #${task.id} allocated to ${agent.name}. Reason: ${recommendation.reason}`,
    status: "assigned",
  });

  await db
    .update(agentsTable)
    .set({
      currentTask: `Task #${task.id}: ${title}`,
      status: "assigned",
      lastActive: "task allocated by orchestrator",
    })
    .where(eq(agentsTable.id, agent.id));

  res.status(201).json({
    accepted: true,
    task: serializeDates(task),
    orchestratorReview: {
      recommendedAgent: recommendation.name,
      role: recommendation.role,
      department: recommendation.department,
      reason: recommendation.reason,
      confidence: recommendation.confidence,
    },
    allocation: {
      agentId: agent.id,
      agentName: agent.name,
      commandId: command.id,
      delivery: "queued_for_agent_ping",
      nextStep: "The assigned agent receives this command through POST /api/agent/ping using its bearer token.",
    },
  });
});

export default router;
