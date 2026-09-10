import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { agentsTable, db, tasksTable } from "@workspace/db";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";
import { buildCanonicalAgentContext, syncCanonicalContextToWorkspace } from "../services/agent-context.js";
import { dispatchRuntime, isRuntimeConfigured } from "../services/agent-runtime.js";
import { certifyEmploymentPack, employmentPackMarkdown, type EmploymentPack } from "../services/agent-employment-pack.js";
import { buildAmandaEmploymentPack, certifyAmandaFinancialController } from "../services/amanda-financial-controller.js";
import { buildJustinEmploymentPack, certifyJustinOperationsManager } from "../services/justin-operations-manager.js";
import { AI_INTELLIGENCE_ANALYST_NAME, DAILY_INTELLIGENCE_TASK, buildAIIntelligenceAnalystEmploymentPack, certifyAIIntelligenceAnalystPack } from "../services/ai-intelligence-analyst.js";
import { getAgentModelPolicy, seedRolePolicy } from "../services/model-policy.js";

const router: IRouter = Router();
type AgentRow = typeof agentsTable.$inferSelect;

function key(agent: AgentRow) { return `${agent.name} ${agent.role}`.toLowerCase(); }
function matches(agent: AgentRow, terms: string[]) { const value = key(agent); return terms.some(term => value.includes(term)); }

async function liveSystemNames(agentId: number): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT i.name FROM integrations i JOIN agent_integrations ai ON ai.integration_id = i.id
    WHERE ai.agent_id = ${agentId} AND lower(coalesce(i.status, '')) = 'connected'
    UNION
    SELECT t.name FROM agent_tools t JOIN agent_tool_access ata ON ata.tool_id = t.id
    WHERE ata.agent_id = ${agentId} AND t.is_active = true
  `);
  return (result.rows ?? []).map(row => String((row as Record<string, unknown>).name ?? "")).filter(Boolean);
}

async function profileJson(agentId: number): Promise<Record<string, unknown>> {
  const result = await db.execute(sql`SELECT profile_json FROM agent_profile_definitions WHERE agent_id = ${agentId} LIMIT 1`);
  const value = (result.rows?.[0] as Record<string, unknown> | undefined)?.profile_json;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function applyEmploymentPack(agentId: number, employment: EmploymentPack) {
  const generatedFiles = employmentPackMarkdown(employment);
  const existing = await profileJson(agentId);
  const profile = { ...existing, employment };
  await db.execute(sql`
    INSERT INTO agent_profile_definitions (agent_id, profile_json, generated_files, version, updated_at)
    VALUES (${agentId}, ${JSON.stringify(profile)}::jsonb, ${JSON.stringify(generatedFiles)}::jsonb, 1, now())
    ON CONFLICT (agent_id) DO UPDATE SET
      profile_json = agent_profile_definitions.profile_json || ${JSON.stringify({ employment })}::jsonb,
      generated_files = agent_profile_definitions.generated_files || ${JSON.stringify(generatedFiles)}::jsonb,
      version = agent_profile_definitions.version + 1,
      updated_at = now()
  `);
  return certifyEmploymentPack(employment);
}

async function ensureAnalystDailyTask(analyst: AgentRow | null) {
  if (!analyst) return { task: null, created: false };
  const [existing] = await db.select().from(tasksTable).where(and(eq(tasksTable.title, DAILY_INTELLIGENCE_TASK.title), eq(tasksTable.assignee, DAILY_INTELLIGENCE_TASK.assignee), eq(tasksTable.recurrence, DAILY_INTELLIGENCE_TASK.recurrence)));
  if (existing) return { task: existing, created: false };
  const [task] = await db.insert(tasksTable).values({ ...DAILY_INTELLIGENCE_TASK, status: "backlog" }).returning();
  return { task, created: true };
}

async function contextProbe(agent: AgentRow | null) {
  if (!agent) return { ready: false, reason: "Employee record missing.", length: 0 };
  const context = await buildCanonicalAgentContext(agent.id).catch(() => "");
  const lower = context.toLowerCase();
  const hasCanonicalHeader = context.includes("# Canonical Mission Control Runtime Context");
  const hasIdentity = lower.includes(`employee: ${agent.name.toLowerCase()}`) && lower.includes(`role: ${agent.role.toLowerCase()}`);
  const hasGuidingRule = lower.includes("scale fast, but safely");
  const ready = hasCanonicalHeader && hasIdentity && hasGuidingRule && context.length >= 300;
  const missing = [!hasCanonicalHeader && "canonical header", !hasIdentity && "runtime identity", !hasGuidingRule && "guiding rule", context.length < 300 && "substantive context"].filter(Boolean);
  return { ready, reason: ready ? "Canonical company context, runtime identity and employee direction assembled." : `Canonical runtime context incomplete: ${missing.join(", ") || "unknown reason"}.`, length: context.length };
}

async function targetAgents() {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  return {
    james: agents.find(agent => matches(agent, ["james", "orchestrator"])) ?? null,
    amanda: agents.find(agent => matches(agent, ["amanda", "financial controller"])) ?? null,
    justin: agents.find(agent => matches(agent, ["justin", "operations manager"])) ?? null,
    analyst: agents.find(agent => matches(agent, ["ai intelligence analyst", "intelligence analyst"])) ?? null,
  };
}

async function statusSnapshot() {
  const { james, amanda, justin, analyst } = await targetAgents();
  const [dailyTask] = await db.select().from(tasksTable).where(and(eq(tasksTable.title, DAILY_INTELLIGENCE_TASK.title), eq(tasksTable.assignee, DAILY_INTELLIGENCE_TASK.assignee)));
  const amandaSystems = amanda ? await liveSystemNames(amanda.id) : [];
  const justinSystems = justin ? await liveSystemNames(justin.id) : [];
  const amandaProfile = amanda ? await profileJson(amanda.id) : {};
  const justinProfile = justin ? await profileJson(justin.id) : {};
  const amandaEvidence = (amandaProfile.amandaCertification && typeof amandaProfile.amandaCertification === "object" ? amandaProfile.amandaCertification : {}) as Record<string, boolean>;
  const justinEvidence = (justinProfile.justinCertification && typeof justinProfile.justinCertification === "object" ? justinProfile.justinCertification : {}) as Record<string, boolean>;
  const agents = [james, amanda, justin, analyst];
  const rows = await Promise.all(agents.map(async agent => agent ? { id: agent.id, name: agent.name, role: agent.role, status: agent.status, provider: agent.provider, model: agent.model, runtimeConfigured: isRuntimeConfigured(agent), context: await contextProbe(agent), modelPolicy: await getAgentModelPolicy(agent.id, `${agent.name} ${agent.role}`).catch(() => null) } : null));

  const gaps: string[] = [];
  const names = ["James Orchestrator", "Amanda Financial Controller", "Justin Operations Manager", "AI Intelligence Analyst"];
  agents.forEach((agent, index) => {
    if (!agent) { gaps.push(`${names[index]} employee record is missing.`); return; }
    if (!isRuntimeConfigured(agent)) gaps.push(`${agent.name} runtime/provider is not configured.`);
    const row = rows[index];
    if (row && !row.context.ready) gaps.push(`${agent.name} canonical context is not ready: ${row.context.reason}`);
  });

  return {
    guidingRule: "Scale fast, but safely.",
    employees: { james: rows[0], amanda: rows[1], justin: rows[2], analyst: rows[3] },
    certifications: {
      amandaEmployment: certifyEmploymentPack(buildAmandaEmploymentPack()),
      amandaOperational: certifyAmandaFinancialController({ availableSystems: amandaSystems, demonstrated: amandaEvidence }),
      justinEmployment: certifyEmploymentPack(buildJustinEmploymentPack()),
      justinOperational: certifyJustinOperationsManager({ availableSystems: justinSystems, demonstrated: justinEvidence }),
      analystEmployment: certifyAIIntelligenceAnalystPack(),
      analystDailyTask: dailyTask ?? null,
      analystOperational: Boolean(analyst && dailyTask && isRuntimeConfigured(analyst)),
    },
    gaps,
    readyForEndToEndCertification: gaps.length === 0,
  };
}

router.get("/ground-zero/certification", async (_req, res): Promise<void> => { res.json(await statusSnapshot()); });

router.post("/ground-zero/prepare", createRateLimit("admin-write", 5, 60_000), async (_req, res): Promise<void> => {
  const { james, amanda, justin, analyst } = await targetAgents();
  const actions: Array<Record<string, unknown>> = [];
  if (amanda) actions.push({ employee: "Amanda", employment: await applyEmploymentPack(amanda.id, buildAmandaEmploymentPack()) });
  if (justin) actions.push({ employee: "Justin", employment: await applyEmploymentPack(justin.id, buildJustinEmploymentPack()) });
  if (analyst) actions.push({ employee: AI_INTELLIGENCE_ANALYST_NAME, employment: await applyEmploymentPack(analyst.id, buildAIIntelligenceAnalystEmploymentPack()) });
  for (const agent of [james, amanda, justin, analyst].filter(Boolean) as AgentRow[]) {
    const policy = await seedRolePolicy(agent);
    const workspace = await syncCanonicalContextToWorkspace(agent.id).catch(error => ({ synced: false, workspacePath: null, error: error instanceof Error ? error.message : String(error) }));
    actions.push({ employee: agent.name, modelPolicy: policy, contextWorkspace: workspace });
  }
  const daily = await ensureAnalystDailyTask(analyst);
  actions.push({ employee: AI_INTELLIGENCE_ANALYST_NAME, dailyTask: daily.task?.id ?? null, dailyTaskCreated: daily.created });
  await auditLog({ action: "ground_zero_operational_prepare", entityType: "system", entityId: "ground-zero", actorType: "admin", actorName: "Mission Control", metadata: `agents=${[james, amanda, justin, analyst].filter(Boolean).length}; analystDailyCreated=${daily.created}` });
  res.json({ actions, status: await statusSnapshot() });
});

router.post("/ground-zero/live-probe", createRateLimit("admin-write", 5, 60_000), async (_req, res): Promise<void> => {
  const status = await statusSnapshot();
  if (!status.readyForEndToEndCertification) { res.status(409).json({ passed: false, skipped: true, reason: "Ground Zero prerequisites are not ready; live model probes were not started.", gaps: status.gaps, status }); return; }
  const targets = await targetAgents();
  const probeRule = "Certification-only role check. Answer only from the canonical context supplied in this request. Do not browse the web, call tools, inspect files, run commands, perform work, or contact external systems. Do not retry or start a research workflow. ";
  const probes: Array<{ key: keyof typeof targets; agent: AgentRow | null; prompt: string; expected: RegExp }> = [
    { key: "james", agent: targets.james, prompt: `${probeRule}State the company guiding rule and whether you may make ordinary reversible business/process decisions without asking Cameron. Keep the answer to two short sentences.`, expected: /scale fast|reversible/i },
    { key: "amanda", agent: targets.amanda, prompt: `${probeRule}State your SBB role boundary with Justin and when you should ask Cameron a factual question. Keep the answer to two short sentences.`, expected: /sales|expenses|finance/i },
    { key: "justin", agent: targets.justin, prompt: `${probeRule}State your SBB operational ownership and your boundary with Amanda. Keep the answer to two short sentences.`, expected: /stock|supplier|cost/i },
    { key: "analyst", agent: targets.analyst, prompt: `${probeRule}State what qualifies for the AI Intelligence Brief and what happens to irrelevant AI news. Keep the answer to two short sentences.`, expected: /noise|scale|streamline|secure|simpl/i },
  ];
  const results = [];
  for (const probe of probes) {
    if (!probe.agent) { results.push({ employee: probe.key, passed: false, blocker: "Employee record missing." }); continue; }
    try {
      const result = await dispatchRuntime(probe.agent, { instructions: probe.prompt, mode: "test" });
      const text = result.output ?? "";
      results.push({ employee: probe.agent.name, passed: result.ok && probe.expected.test(text), runtimeOk: result.ok, provider: result.provider, model: result.model ?? null, output: text.slice(0, 1200), error: result.error });
    } catch (error) {
      results.push({ employee: probe.agent.name, passed: false, runtimeOk: false, provider: probe.agent.provider, model: probe.agent.model, output: "", error: error instanceof Error ? error.message : String(error) });
    }
  }
  await auditLog({ action: "ground_zero_live_context_probe", entityType: "system", entityId: "ground-zero", actorType: "admin", actorName: "Mission Control", metadata: results.map(item => `${item.employee}:${item.passed}`).join(",") });
  res.json({ passed: results.every(result => result.passed === true), results, status: await statusSnapshot() });
});

router.post("/ground-zero/certification-evidence/:employee", createRateLimit("admin-write", 10, 60_000), async (req, res): Promise<void> => {
  const employee = String(req.params.employee || "").toLowerCase();
  const { amanda, justin } = await targetAgents();
  const target = employee === "amanda" ? amanda : employee === "justin" ? justin : null;
  if (!target) { res.status(404).json({ error: "Employee not found or certification evidence is not supported for this employee." }); return; }
  const evidenceKey = employee === "amanda" ? "amandaCertification" : "justinCertification";
  const allowed = employee === "amanda" ? ["retrieve", "identify", "investigate", "delegatedDecision", "conciseReport", "correctEscalation"] : ["retrieve", "costing", "stockReview", "investigate", "delegatedDecision", "conciseReport", "correctEscalation"];
  const evidence = Object.fromEntries(allowed.map(id => [id, req.body?.[id] === true]));
  await db.execute(sql`
    INSERT INTO agent_profile_definitions (agent_id, profile_json, generated_files, version, updated_at)
    VALUES (${target.id}, ${JSON.stringify({ [evidenceKey]: evidence })}::jsonb, '{}'::jsonb, 1, now())
    ON CONFLICT (agent_id) DO UPDATE SET profile_json = agent_profile_definitions.profile_json || ${JSON.stringify({ [evidenceKey]: evidence })}::jsonb, version = agent_profile_definitions.version + 1, updated_at = now()
  `);
  await auditLog({ action: "ground_zero_certification_evidence_recorded", entityType: "agent", entityId: target.id, actorType: "admin", actorName: "Mission Control", metadata: `${employee}:${JSON.stringify(evidence)}` });
  res.json(await statusSnapshot());
});

export default router;
