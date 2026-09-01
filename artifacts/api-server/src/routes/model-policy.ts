import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, agentsTable } from "@workspace/db";
import { agentRuntimeInstancesTable } from "@workspace/db/provisioning";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";
import { defaultPolicyFor, classifyModelTask, getAgentModelPolicy, seedRolePolicy, upsertAgentModelPolicy, type ModelCostClass, type ModelPolicyClass } from "../services/model-policy.js";

const router: IRouter = Router();
const POLICY_CLASSES = new Set<ModelPolicyClass>(["free", "economy", "balanced", "strong"]);
const COST_CLASSES = new Set<ModelCostClass>(["free", "low", "standard", "high"]);

router.get("/model-policy", async (_req, res): Promise<void> => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  const rows = [];
  for (const agent of agents) {
    const policy = await getAgentModelPolicy(agent.id, `${agent.name} ${agent.role}`);
    const [runtime] = await db.select().from(agentRuntimeInstancesTable).where(eq(agentRuntimeInstancesTable.agentId, agent.id));
    rows.push({
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      runtimeProvider: agent.provider,
      runtimeModel: runtime?.model ?? agent.model ?? null,
      policy,
      runtimeAligned: !runtime?.model || runtime.model === policy.primaryModel,
    });
  }
  res.json({
    agents: rows,
    defaults: {
      research: defaultPolicyFor("research"), marketing: defaultPolicyFor("marketing"), coding: defaultPolicyFor("coding"),
      finance: defaultPolicyFor("finance"), orchestration: defaultPolicyFor("orchestration"), general: defaultPolicyFor("general"),
    },
  });
});

router.post("/model-policy/seed", createRateLimit("admin-write", 10, 60_000), async (_req, res): Promise<void> => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  const policies = [];
  for (const agent of agents) policies.push(await seedRolePolicy(agent));
  await auditLog({ action: "model_policy_seeded", entityType: "system", actorType: "admin", actorName: "Mission Control", metadata: `agents=${agents.length}` });
  res.json({ seeded: agents.length, policies });
});

router.put("/agents/:id/model-policy", createRateLimit("admin-write", 20, 60_000), async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  if (!Number.isInteger(agentId) || agentId <= 0) { res.status(400).json({ error: "Invalid agent id" }); return; }
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  const policyClass = String(req.body?.policyClass ?? "") as ModelPolicyClass;
  const maxCostClass = String(req.body?.maxCostClass ?? "") as ModelCostClass;
  const provider = String(req.body?.provider ?? "openrouter").trim().toLowerCase();
  const primaryModel = String(req.body?.primaryModel ?? "").trim();
  const fallbackModel = typeof req.body?.fallbackModel === "string" && req.body.fallbackModel.trim() ? req.body.fallbackModel.trim() : null;
  const conditions = Array.isArray(req.body?.escalationConditions) ? req.body.escalationConditions.filter((v: unknown) => typeof v === "string" && v.trim()).map((v: string) => v.trim()) : [];
  if (!POLICY_CLASSES.has(policyClass) || !COST_CLASSES.has(maxCostClass) || !primaryModel) { res.status(400).json({ error: "policyClass, maxCostClass and primaryModel must be valid" }); return; }
  const policy = { agentId, policyClass, provider, primaryModel, fallbackModel, maxCostClass, allowEscalation: req.body?.allowEscalation !== false, escalationConditions: conditions };
  await upsertAgentModelPolicy(policy);
  await db.update(agentsTable).set({ model: primaryModel }).where(eq(agentsTable.id, agentId));
  await db.update(agentRuntimeInstancesTable).set({ model: primaryModel, updatedAt: new Date() }).where(eq(agentRuntimeInstancesTable.agentId, agentId));
  await auditLog({ action: "model_policy_updated", entityType: "agent", entityId: agentId, actorType: "admin", actorName: "Mission Control", metadata: `${policyClass}:${primaryModel}:${maxCostClass}` });
  res.json({ policy, runtimeSync: agent.provider === "openclaw" ? "PENDING_OPENCLAW_CONFIG_SYNC" : "APPLIED", note: agent.provider === "openclaw" ? "Mission Control metadata is updated; OpenClaw configured default must be synchronized through its runtime before claiming the new model is active." : "Direct provider dispatch uses the policy immediately." });
});

router.get("/model-usage", async (req, res): Promise<void> => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const result = await db.execute(sql`
    SELECT e.agent_id, a.name AS agent_name, e.provider, e.model, e.policy_class,
           count(*)::int AS requests,
           coalesce(sum(e.input_tokens), 0)::bigint AS input_tokens,
           coalesce(sum(e.output_tokens), 0)::bigint AS output_tokens,
           coalesce(sum(e.total_tokens), 0)::bigint AS total_tokens,
           coalesce(sum(e.cost_usd), 0)::numeric AS cost_usd,
           count(*) FILTER (WHERE e.success = false)::int AS failed_requests
    FROM model_usage_events e
    LEFT JOIN agents a ON a.id = e.agent_id
    WHERE e.created_at >= now() - (${days}::text || ' days')::interval
    GROUP BY e.agent_id, a.name, e.provider, e.model, e.policy_class
    ORDER BY cost_usd DESC, requests DESC
  `);
  res.json({ days, usage: result.rows ?? [] });
});

router.get("/model-policy/recommend/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [agent] = Number.isInteger(id) ? await db.select().from(agentsTable).where(eq(agentsTable.id, id)) : [];
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  const taskClass = classifyModelTask(`${agent.name} ${agent.role}`);
  res.json({ agentId: agent.id, taskClass, recommended: { ...defaultPolicyFor(taskClass), agentId: agent.id } });
});

export default router;
