import { decryptSecret, encryptSecret } from "../lib/security.js";
import { auditLog } from "../lib/audit.js";
import { createRateLimit } from "../lib/rate-limit.js";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agentsTable } from "@workspace/db";
import {
  CreateAgentBody,
  GetAgentParams,
  UpdateAgentParams,
  UpdateAgentBody,
} from "@workspace/api-zod";
import { serializeDates } from "../utils/serialize.js";
import {
  getAssignedSkillNamesForAgent,
  initializeAgentSkillAssignments,
  setAssignedSkillNamesForAgent,
} from "../config-operational-agents.js";
import { reconcileAgentStates } from "../services/execution-runtime.js";

const router: IRouter = Router();

const LEGACY_DEPARTMENT_PLACEHOLDER = "Operators";

function normalizeDepartment(value: unknown, required: boolean): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim();
}

function maskApiKey(apiKey: string | null | undefined): string | null {
  if (!apiKey) return null;
  if (apiKey.length <= 4) return "••••";
  return "••••" + apiKey.slice(-4);
}

function maskAgentForResponse(agent: typeof agentsTable.$inferSelect) {
  const { apiKey, ...rest } = agent;
  return {
    ...rest,
    apiKeyHint: maskApiKey(decryptSecret(apiKey)),
    assignedSkills: getAssignedSkillNamesForAgent(agent.name),
  };
}

router.get("/agents", async (_req, res): Promise<void> => {
  await reconcileAgentStates();
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  res.json(serializeDates(agents.map(maskAgentForResponse)));
});

router.post("/agents", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const department = normalizeDepartment(req.body?.department, true);
  if (!department) {
    res.status(400).json({ error: "department must be a non-empty string" });
    return;
  }

  // Keep the generated validator authoritative for every other field while
  // bypassing its obsolete four-value department enum.
  const parsed = CreateAgentBody.safeParse({ ...req.body, department: LEGACY_DEPARTMENT_PLACEHOLDER });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { apiKey, ...validated } = parsed.data;
  const rest = { ...validated, department };
  const insertData = {
    ...rest,
    apiKey: encryptSecret(apiKey ?? null),
    lastActive: "just now",
    status: "idle" as const,
    isPluggedIn: rest.isPluggedIn ?? false,
  };
  const [agent] = await db.insert(agentsTable).values(insertData).returning();
  await initializeAgentSkillAssignments();
  await auditLog({ action: "created", entityType: "agent", entityId: agent.id, actorType: "admin", actorName: "Mission Control" });
  res.status(201).json(serializeDates(maskAgentForResponse(agent)));
});

router.put("/agents/:id/skills", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid agent id" });
    return;
  }
  if (!Array.isArray(req.body?.skills) || !req.body.skills.every((skill: unknown) => typeof skill === "string")) {
    res.status(400).json({ error: "skills must be an array of skill names" });
    return;
  }
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const assignedSkills = await setAssignedSkillNamesForAgent(id, agent.name, req.body.skills);
  await auditLog({
    action: "skills_updated",
    entityType: "agent",
    entityId: agent.id,
    actorType: "admin",
    actorName: "Mission Control",
    metadata: `assignedSkills=${assignedSkills.join(",")}`,
  });
  res.json({ agentId: agent.id, assignedSkills });
});

router.get("/agents/:id", async (req, res): Promise<void> => {
  const params = GetAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await reconcileAgentStates([params.data.id]);
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, params.data.id));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(serializeDates(maskAgentForResponse(agent)));
});

router.patch("/agents/:id", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const params = UpdateAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const hasDepartment = Object.prototype.hasOwnProperty.call(req.body ?? {}, "department");
  const department = normalizeDepartment(req.body?.department, hasDepartment);
  if (hasDepartment && !department) {
    res.status(400).json({ error: "department must be a non-empty string" });
    return;
  }

  const parsed = UpdateAgentBody.safeParse(
    hasDepartment ? { ...req.body, department: LEGACY_DEPARTMENT_PLACEHOLDER } : req.body,
  );
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { apiKey, ...validated } = parsed.data;
  const rest = department ? { ...validated, department } : validated;
  const updateData: Partial<typeof agentsTable.$inferInsert> = { ...rest };
  if (apiKey !== undefined) {
    updateData.apiKey = encryptSecret(apiKey);
  }
  const [agent] = await db.update(agentsTable).set(updateData).where(eq(agentsTable.id, params.data.id)).returning();
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  await initializeAgentSkillAssignments();
  await auditLog({ action: "updated", entityType: "agent", entityId: agent.id, actorType: "admin", actorName: "Mission Control" });
  res.json(serializeDates(maskAgentForResponse(agent)));
});

router.delete("/agents/:id", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [agent] = await db.delete(agentsTable).where(eq(agentsTable.id, id)).returning();
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  await initializeAgentSkillAssignments();
  await auditLog({ action: "deleted", entityType: "agent", entityId: agent.id, actorType: "admin", actorName: "Mission Control" });
  res.sendStatus(204);
});

export default router;
