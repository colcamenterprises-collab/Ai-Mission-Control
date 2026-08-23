import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { agentCommandsTable, db } from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";
import { resolveCapabilities } from "../services/capability-router.js";
import { intakeActionableTask, IntakeValidationError } from "../services/orchestrator-intake.js";

const router: IRouter = Router();

const CAPABILITY_TERMS: Array<[string, string[]]> = [
  ["software-development", ["code", "repo", "github", "deploy", "bug", "fix", "patch", "react", "api", "database", "typescript", "build"]],
  ["research", ["research", "compare", "source", "verify", "latest", "news", "analysis"]],
  ["content", ["write", "document", "markdown", "summary", "copy", "email", "brief", "content"]],
  ["marketing", ["marketing", "outreach", "campaign", "lead", "ads", "social", "crm", "sales"]],
  ["operations", ["operations", "report", "stock", "staff", "process", "workflow", "support"]],
];

function deriveCapabilities(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.capabilities)) {
    return [...new Set(record.capabilities.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim()))];
  }
  const text = [record.title, record.description, record.project].filter((item): item is string => typeof item === "string").join(" ").toLowerCase();
  return CAPABILITY_TERMS.filter(([, terms]) => terms.some(term => text.includes(term))).map(([capability]) => capability);
}

async function persistRoutingContext(commandId: number, routing: Awaited<ReturnType<typeof resolveCapabilities>>, capabilities: string[]) {
  const [command] = await db.select().from(agentCommandsTable).where(eq(agentCommandsTable.id, commandId));
  if (!command) return;
  let existing: Record<string, unknown> = {};
  try { existing = command.context ? JSON.parse(command.context) : {}; } catch { existing = { legacyContext: command.context }; }
  const context = JSON.stringify({
    ...existing,
    capabilityRouting: {
      capabilities,
      routingReason: routing.routingReason,
      routedAgentName: routing.agentName,
      selectedSkills: routing.skills,
    },
  }, null, 2);
  await db.update(agentCommandsTable).set({ context }).where(eq(agentCommandsTable.id, commandId));
}

async function handleIntake(req: Request, res: Response, legacyTaskEndpoint = false): Promise<void> {
  try {
    const body = req.body && typeof req.body === "object" ? { ...req.body } : {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!body.description && title) body.description = title;

    const explicitRequestedAgent = typeof body.requestedAgent === "string" && body.requestedAgent.trim()
      ? body.requestedAgent.trim()
      : typeof body.assignee === "string" && body.assignee.trim() && body.assignee !== "Unassigned"
        ? body.assignee.trim()
        : null;

    const capabilities = deriveCapabilities(body);
    let routing: Awaited<ReturnType<typeof resolveCapabilities>> | null = null;
    if (!explicitRequestedAgent && capabilities.length) {
      routing = await resolveCapabilities(`${title} ${typeof body.description === "string" ? body.description : ""}`, { capabilities });
      body.requestedAgent = routing.agentId && routing.agentName ? routing.agentName : "Unassigned";
    } else if (explicitRequestedAgent) {
      body.requestedAgent = explicitRequestedAgent;
    }

    const result = await intakeActionableTask(body);
    if (routing && result.allocation) await persistRoutingContext(result.allocation.commandId, routing, capabilities);

    if (legacyTaskEndpoint) {
      res.status(result.created ? 201 : 200).json(serializeDates(result.task));
      return;
    }
    res.status(result.created ? 201 : 200).json({
      accepted: true,
      task: serializeDates(result.task),
      orchestratorReview: result.orchestratorReview,
      allocation: result.allocation,
      capabilityRouting: routing ? { capabilities, routingReason: routing.routingReason, agentName: routing.agentName, skills: routing.skills } : null,
    });
  } catch (error) {
    if (error instanceof IntakeValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
}

// Canonical task creation. This router is mounted before tasksRouter so POST /tasks
// cannot bypass orchestration, governed skill selection, or fail-closed routing.
router.post("/tasks", async (req, res): Promise<void> => handleIntake(req, res, true));
router.post("/orchestrator/intake", async (req, res): Promise<void> => handleIntake(req, res));

export default router;
