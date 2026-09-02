import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { agentsTable, db, projectsTable, signalsTable, tasksTable } from "@workspace/db";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";
import { employmentPackMarkdown } from "../services/agent-employment-pack.js";
import { provisionEmployee } from "../services/agent-provisioner.js";
import { upsertAgentModelPolicy } from "../services/model-policy.js";
import {
  AI_INTELLIGENCE_ANALYST_NAME,
  AI_INTELLIGENCE_ANALYST_ROLE,
  DAILY_INTELLIGENCE_TASK,
  buildAIIntelligenceAnalystEmploymentPack,
  certifyAIIntelligenceAnalystPack,
  scoreIntelligenceFinding,
  type IntelligenceScoreInput,
} from "../services/ai-intelligence-analyst.js";

const router: IRouter = Router();
const positiveInt = (value: unknown) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; };
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

async function findAnalyst() {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.name, AI_INTELLIGENCE_ANALYST_NAME));
  return agent ?? null;
}

async function ensureAnalystProfile(agentId: number) {
  const employment = buildAIIntelligenceAnalystEmploymentPack();
  const generatedFiles = employmentPackMarkdown(employment);
  const profile = {
    identity: { mission: employment.role.purpose, successDefinition: employment.success.outcomes },
    soul: { communicationStyle: employment.communication.ownerStyle, decisionStyle: "Evidence-first, low-noise, risk-aware.", initiative: employment.delegations.autonomous, challengeOwner: employment.escalation.escalateWhen, principles: employment.success.qualityBar, neverDo: employment.boundaries.neverDo },
    operating: { autonomy: employment.delegations.autonomous, approvalRequired: employment.delegations.ownerApproval, completionStandard: employment.success.qualityBar, reportingStyle: employment.communication.reportingFormat },
    user: { managerName: "James", communicationPreferences: employment.communication.orchestratorStyle, escalationRules: employment.escalation.escalateWhen },
    tools: { allowedTools: employment.systems.required, accessRules: employment.systems.accessRules },
    heartbeat: { recurringDuties: employment.responsibilities.recurring, alertConditions: employment.escalation.escalateWhen },
    memory: { seed: "Only retain consequential, source-backed findings that change a Mission Control or Customli decision." },
    employment,
  };
  await db.execute(sql`
    INSERT INTO agent_profile_definitions (agent_id, profile_json, generated_files, version, updated_at)
    VALUES (${agentId}, ${JSON.stringify(profile)}::jsonb, ${JSON.stringify(generatedFiles)}::jsonb, 1, now())
    ON CONFLICT (agent_id) DO UPDATE SET
      profile_json = EXCLUDED.profile_json,
      generated_files = EXCLUDED.generated_files,
      version = agent_profile_definitions.version + 1,
      updated_at = now()
  `);
  return { employment, certification: certifyAIIntelligenceAnalystPack(), generatedFiles: Object.keys(generatedFiles) };
}

async function ensureDailyTask() {
  const [existing] = await db.select().from(tasksTable).where(and(
    eq(tasksTable.title, DAILY_INTELLIGENCE_TASK.title),
    eq(tasksTable.assignee, DAILY_INTELLIGENCE_TASK.assignee),
    eq(tasksTable.recurrence, DAILY_INTELLIGENCE_TASK.recurrence),
  ));
  if (existing) return { task: existing, created: false };
  const [task] = await db.insert(tasksTable).values({ ...DAILY_INTELLIGENCE_TASK, status: "backlog" }).returning();
  return { task, created: true };
}

router.get("/intelligence-analyst/status", async (_req, res): Promise<void> => {
  const analyst = await findAnalyst();
  const [dailyTask] = await db.select().from(tasksTable).where(and(eq(tasksTable.title, DAILY_INTELLIGENCE_TASK.title), eq(tasksTable.assignee, DAILY_INTELLIGENCE_TASK.assignee)));
  res.json({
    analyst: analyst ? { id: analyst.id, name: analyst.name, role: analyst.role, status: analyst.status, provider: analyst.provider, model: analyst.model } : null,
    employmentCertification: certifyAIIntelligenceAnalystPack(),
    dailyTask: dailyTask ?? null,
    operational: Boolean(analyst && dailyTask),
  });
});

router.post("/intelligence-analyst/bootstrap", createRateLimit("admin-write", 5, 60_000), async (req, res): Promise<void> => {
  let analyst = await findAnalyst();
  let provisioned = false;
  if (!analyst) {
    const runtimeHostId = positiveInt(req.body?.runtimeHostId);
    const secretId = positiveInt(req.body?.secretId);
    const templateId = positiveInt(req.body?.templateId);
    if (!runtimeHostId || !secretId) {
      res.status(409).json({
        error: "AI Intelligence Analyst is not yet provisioned. runtimeHostId and secretId are required to create the live OpenClaw employee; Mission Control will not invent runtime access.",
        employmentCertification: certifyAIIntelligenceAnalystPack(),
      });
      return;
    }
    let [project] = await db.select().from(projectsTable).where(eq(projectsTable.name, DAILY_INTELLIGENCE_TASK.project));
    if (!project) [project] = await db.insert(projectsTable).values({ name: DAILY_INTELLIGENCE_TASK.project, description: "Mission Control platform and company AI operations." }).returning();
    const result = await provisionEmployee({
      name: AI_INTELLIGENCE_ANALYST_NAME,
      role: AI_INTELLIGENCE_ANALYST_ROLE,
      department: "Intelligence",
      business: "Customli / Mission Control",
      owner: "James",
      responsibilities: buildAIIntelligenceAnalystEmploymentPack().responsibilities.owns,
      runtimeHostId,
      runtimeType: "openclaw",
      provider: "openrouter",
      model: "openrouter/free",
      secretId,
      templateId,
    });
    analyst = result.agent;
    provisioned = true;
    await db.execute(sql`INSERT INTO agent_employee_profiles (agent_id, project_id, project_name, updated_at) VALUES (${analyst.id}, ${project.id}, ${project.name}, now()) ON CONFLICT (agent_id) DO UPDATE SET project_id=EXCLUDED.project_id, project_name=EXCLUDED.project_name, updated_at=now()`);
  }

  const profile = await ensureAnalystProfile(analyst.id);
  await upsertAgentModelPolicy({
    agentId: analyst.id,
    policyClass: "free",
    provider: "openrouter",
    primaryModel: "openrouter/free",
    fallbackModel: "openrouter/auto",
    maxCostClass: "free",
    allowEscalation: true,
    escalationConditions: ["free router unavailable", "required research capability missing", "James approves stronger reasoning for a consequential finding"],
  });
  const daily = await ensureDailyTask();
  await auditLog({ action: "ai_intelligence_analyst_bootstrapped", entityType: "agent", entityId: analyst.id, actorType: "admin", actorName: "Mission Control", metadata: `provisioned=${provisioned}; dailyTaskCreated=${daily.created}; employmentReady=${profile.certification.ready}` });
  res.status(provisioned ? 201 : 200).json({ analyst, provisioned, ...profile, modelPolicy: { primaryModel: "openrouter/free", fallbackModel: "openrouter/auto", maxCostClass: "free" }, dailyTask: daily.task, dailyTaskCreated: daily.created });
});

router.post("/intelligence-analyst/score", async (req, res): Promise<void> => {
  const body = req.body as Partial<IntelligenceScoreInput>;
  const required = ["relevance", "businessBenefit", "missionControlBenefit", "implementationComplexity", "securityRisk", "operationalRisk", "costImpact", "evidenceQuality"] as const;
  if (required.some(key => typeof body[key] !== "number")) { res.status(400).json({ error: `All score dimensions are required: ${required.join(", ")}` }); return; }
  res.json(scoreIntelligenceFinding(body as IntelligenceScoreInput));
});

router.post("/intelligence-analyst/findings", createRateLimit("admin-write", 30, 60_000), async (req, res): Promise<void> => {
  const title = text(req.body?.title); const source = text(req.body?.source); const category = text(req.body?.category) || "AI Intelligence";
  const evidence = Array.isArray(req.body?.evidence) ? req.body.evidence.filter((item: unknown) => typeof item === "string" && item.trim()) : [];
  if (!title || !source || !evidence.length || !req.body?.score) { res.status(400).json({ error: "title, source, evidence and score are required" }); return; }
  const score = scoreIntelligenceFinding(req.body.score as IntelligenceScoreInput);
  const [signal] = await db.insert(signalsTable).values({
    title, source, category,
    evidence: [...evidence, { intelligenceScore: score }],
    confidence: String(Math.min(1, score.evidenceQuality / 5)),
    business: text(req.body?.business) || "Customli / Mission Control",
    project: text(req.body?.project) || "Mission Control",
    severity: score.requiresOwnerApproval ? "high" : score.decision === "IMPLEMENT" ? "medium" : "low",
    urgency: score.decision === "IMPLEMENT" ? "high" : score.decision === "REVIEW" ? "medium" : "low",
    actionability: score.decision,
    owner: score.requiresOwnerApproval ? "Owner" : score.requiresJamesReview ? "James" : AI_INTELLIGENCE_ANALYST_NAME,
    detectedAt: new Date(),
  }).returning();

  let task: typeof tasksTable.$inferSelect | null = null;
  if (score.decision === "REVIEW" || score.decision === "IMPLEMENT") {
    [task] = await db.insert(tasksTable).values({
      title: `${score.decision}: ${title}`,
      description: `AI Intelligence finding\nSource: ${source}\nScore: ${score.score}/100\nDecision: ${score.decision}\nOwner approval required: ${score.requiresOwnerApproval}\nEvidence: ${JSON.stringify(evidence)}\nJames: verify evidence, risk, delegation and implementation path. For low-risk reversible IMPLEMENT findings inside existing delegation, assign execution and QA without owner shepherding.`,
      assignee: "James",
      priority: score.requiresOwnerApproval ? "high" : score.decision === "IMPLEMENT" ? "high" : "medium",
      status: "backlog",
      project: text(req.body?.project) || "Mission Control",
      recurrence: "one_off",
      approvalRequired: score.requiresOwnerApproval,
      ownerReviewRequired: score.requiresOwnerApproval,
      nextAction: score.requiresOwnerApproval ? "James to prepare the smallest owner decision required." : "James to validate and route the finding under existing delegation.",
      nextActionOwner: score.requiresOwnerApproval ? "James" : "James",
    }).returning();
    await db.update(signalsTable).set({ linkedTaskId: task.id, status: "converted" }).where(eq(signalsTable.id, signal.id));
  }
  await auditLog({ action: "ai_intelligence_finding_recorded", entityType: "signal", entityId: signal.id, actorType: "admin", actorName: AI_INTELLIGENCE_ANALYST_NAME, metadata: `decision=${score.decision}; score=${score.score}; taskId=${task?.id ?? "none"}` });
  res.status(201).json({ signal: { ...signal, linkedTaskId: task?.id ?? null }, score, task });
});

export default router;
