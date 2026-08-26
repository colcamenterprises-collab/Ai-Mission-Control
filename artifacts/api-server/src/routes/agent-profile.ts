import path from "node:path";
import { promises as fs } from "node:fs";
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, agentsTable } from "@workspace/db";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";

const router: IRouter = Router();

type AgentProfile = {
  identity: { mission: string; successDefinition: string };
  soul: { communicationStyle: string; decisionStyle: string; initiative: string; challengeOwner: string; principles: string; neverDo: string };
  operating: { autonomy: string; approvalRequired: string; completionStandard: string; reportingStyle: string };
  user: { managerName: string; communicationPreferences: string; escalationRules: string };
  tools: { allowedTools: string; accessRules: string };
  heartbeat: { recurringDuties: string; alertConditions: string };
  memory: { seed: string };
};

type AgentRow = typeof agentsTable.$inferSelect;

const emptyProfile = (): AgentProfile => ({
  identity: { mission: "", successDefinition: "" },
  soul: { communicationStyle: "", decisionStyle: "", initiative: "", challengeOwner: "", principles: "", neverDo: "" },
  operating: { autonomy: "", approvalRequired: "", completionStandard: "", reportingStyle: "" },
  user: { managerName: "", communicationPreferences: "", escalationRules: "" },
  tools: { allowedTools: "", accessRules: "" },
  heartbeat: { recurringDuties: "", alertConditions: "" },
  memory: { seed: "" },
});

function clean(value: unknown, max = 8000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeProfile(value: unknown): AgentProfile {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const section = (name: string) => input[name] && typeof input[name] === "object" ? input[name] as Record<string, unknown> : {};
  const identity = section("identity");
  const soul = section("soul");
  const operating = section("operating");
  const user = section("user");
  const tools = section("tools");
  const heartbeat = section("heartbeat");
  const memory = section("memory");
  return {
    identity: { mission: clean(identity.mission), successDefinition: clean(identity.successDefinition) },
    soul: {
      communicationStyle: clean(soul.communicationStyle), decisionStyle: clean(soul.decisionStyle), initiative: clean(soul.initiative),
      challengeOwner: clean(soul.challengeOwner), principles: clean(soul.principles), neverDo: clean(soul.neverDo),
    },
    operating: {
      autonomy: clean(operating.autonomy), approvalRequired: clean(operating.approvalRequired),
      completionStandard: clean(operating.completionStandard), reportingStyle: clean(operating.reportingStyle),
    },
    user: { managerName: clean(user.managerName), communicationPreferences: clean(user.communicationPreferences), escalationRules: clean(user.escalationRules) },
    tools: { allowedTools: clean(tools.allowedTools), accessRules: clean(tools.accessRules) },
    heartbeat: { recurringDuties: clean(heartbeat.recurringDuties), alertConditions: clean(heartbeat.alertConditions) },
    memory: { seed: clean(memory.seed, 16000) },
  };
}

function md(value: string, fallback = "Not yet defined."): string { return value.trim() || fallback; }

function generateMarkdown(agent: AgentRow, business: string | null, profile: AgentProfile): Record<string, string> {
  const company = business?.trim() || "Assigned business";
  return {
    "IDENTITY.md": `# Identity\n\n- **Name:** ${agent.name}\n- **Role:** ${agent.role}\n- **Department:** ${agent.department}\n- **Business / Project:** ${company}\n\n## Mission\n${md(profile.identity.mission)}\n\n## Definition of success\n${md(profile.identity.successDefinition)}\n`,
    "SOUL.md": `# Soul\n\n## Communication style\n${md(profile.soul.communicationStyle)}\n\n## Decision style\n${md(profile.soul.decisionStyle)}\n\n## Initiative\n${md(profile.soul.initiative)}\n\n## Challenging the owner\n${md(profile.soul.challengeOwner)}\n\n## Guiding principles\n${md(profile.soul.principles)}\n\n## Never do\n${md(profile.soul.neverDo)}\n`,
    "AGENTS.md": `# Operating Instructions\n\n## Mission\n${md(profile.identity.mission)}\n\n## Core responsibilities\n${md(agent.responsibilities || "")}\n\n## Autonomous authority\n${md(profile.operating.autonomy)}\n\n## Owner approval required\n${md(profile.operating.approvalRequired)}\n\n## Completion standard\n${md(profile.operating.completionStandard)}\n\n## Reporting style\n${md(profile.operating.reportingStyle)}\n`,
    "USER.md": `# Owner and User Context\n\n## Primary manager\n${md(profile.user.managerName)}\n\n## Communication preferences\n${md(profile.user.communicationPreferences)}\n\n## Escalation rules\n${md(profile.user.escalationRules)}\n`,
    "TOOLS.md": `# Tools and Access\n\n## Allowed tools and systems\n${md(profile.tools.allowedTools)}\n\n## Access and usage rules\n${md(profile.tools.accessRules)}\n\n> Credentials are never stored in this file. Mission Control supplies approved secret references at runtime.\n`,
    "HEARTBEAT.md": `# Heartbeat and Recurring Duties\n\n## Recurring duties\n${md(profile.heartbeat.recurringDuties)}\n\n## Alert conditions\n${md(profile.heartbeat.alertConditions)}\n`,
    "MEMORY.md": `# Agent-owned Memory Seed\n\n${md(profile.memory.seed, "No agent-specific memory has been seeded yet.")}\n`,
  };
}

function profileCompleteness(profile: AgentProfile): number {
  const values = [
    profile.identity.mission, profile.identity.successDefinition, profile.soul.communicationStyle, profile.soul.decisionStyle,
    profile.soul.initiative, profile.soul.challengeOwner, profile.soul.principles, profile.soul.neverDo, profile.operating.autonomy,
    profile.operating.approvalRequired, profile.operating.completionStandard, profile.operating.reportingStyle, profile.user.managerName,
    profile.user.communicationPreferences, profile.user.escalationRules, profile.tools.allowedTools, profile.tools.accessRules,
    profile.heartbeat.recurringDuties, profile.heartbeat.alertConditions, profile.memory.seed,
  ];
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

function assertManagedWorkspace(workspace: string): void {
  const resolved = path.resolve(workspace);
  const allowed = ["/root/.openclaw/", "/root/.hermes/"];
  if (!allowed.some(prefix => resolved.startsWith(prefix))) throw new Error("Refusing to write agent profile outside an approved managed runtime workspace.");
}

async function getAgentBundle(agentId: number) {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) return null;
  const profileResult = await db.execute(sql`
    SELECT aep.project_name AS "projectName", apd.profile_json AS "profileJson", apd.version,
           ari.workspace_path AS "workspacePath", ari.runtime_type AS "runtimeType", ari.health AS "runtimeHealth"
    FROM agents a
    LEFT JOIN agent_employee_profiles aep ON aep.agent_id = a.id
    LEFT JOIN agent_profile_definitions apd ON apd.agent_id = a.id
    LEFT JOIN agent_runtime_instances ari ON ari.agent_id = a.id
    WHERE a.id = ${agentId}
    LIMIT 1
  `);
  const row = (profileResult.rows?.[0] ?? {}) as Record<string, unknown>;
  const profile = normalizeProfile(row.profileJson ?? emptyProfile());
  return {
    agent,
    profile,
    projectName: typeof row.projectName === "string" ? row.projectName : null,
    workspacePath: typeof row.workspacePath === "string" ? row.workspacePath : null,
    runtimeType: typeof row.runtimeType === "string" ? row.runtimeType : null,
    runtimeHealth: typeof row.runtimeHealth === "string" ? row.runtimeHealth : null,
    version: Number(row.version || 1),
  };
}

router.get("/employee-factory/agents/:id/definition", async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  if (!Number.isInteger(agentId) || agentId <= 0) { res.status(400).json({ error: "Invalid employee id." }); return; }
  const bundle = await getAgentBundle(agentId);
  if (!bundle) { res.status(404).json({ error: "Employee not found." }); return; }
  const generatedFiles = generateMarkdown(bundle.agent, bundle.projectName, bundle.profile);
  res.json({
    profile: bundle.profile,
    completeness: profileCompleteness(bundle.profile),
    projectName: bundle.projectName,
    workspaceConnected: Boolean(bundle.workspacePath),
    runtimeType: bundle.runtimeType,
    runtimeHealth: bundle.runtimeHealth,
    generatedFiles,
    version: bundle.version,
  });
});

router.put("/employee-factory/agents/:id/definition", createRateLimit("admin-write", 30, 60_000), async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  if (!Number.isInteger(agentId) || agentId <= 0) { res.status(400).json({ error: "Invalid employee id." }); return; }
  try {
    const bundle = await getAgentBundle(agentId);
    if (!bundle) { res.status(404).json({ error: "Employee not found." }); return; }
    const profile = normalizeProfile(req.body?.profile);
    const files = generateMarkdown(bundle.agent, bundle.projectName, profile);
    const result = await db.execute(sql`
      INSERT INTO agent_profile_definitions (agent_id, profile_json, generated_files, version, updated_at)
      VALUES (${agentId}, ${JSON.stringify(profile)}::jsonb, ${JSON.stringify(files)}::jsonb, 1, now())
      ON CONFLICT (agent_id) DO UPDATE SET
        profile_json = EXCLUDED.profile_json,
        generated_files = EXCLUDED.generated_files,
        version = agent_profile_definitions.version + 1,
        updated_at = now()
      RETURNING version, updated_at AS "updatedAt"
    `);

    let workspaceSynced = false;
    if (bundle.workspacePath) {
      assertManagedWorkspace(bundle.workspacePath);
      await fs.mkdir(bundle.workspacePath, { recursive: true });
      await Promise.all(Object.entries(files).map(([filename, content]) => fs.writeFile(path.join(bundle.workspacePath!, filename), content, "utf8")));
      workspaceSynced = true;
    }

    await auditLog({ action: "profile_updated", entityType: "agent_profile", entityId: agentId, actorType: "admin", actorName: "Mission Control", metadata: `workspaceSynced=${workspaceSynced}` });
    res.json({ profile, generatedFiles: files, completeness: profileCompleteness(profile), workspaceSynced, ...(result.rows?.[0] ?? {}) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Employee profile could not be saved." });
  }
});

router.get("/employee-factory/agents/:id/export", async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  if (!Number.isInteger(agentId) || agentId <= 0) { res.status(400).json({ error: "Invalid employee id." }); return; }
  const bundle = await getAgentBundle(agentId);
  if (!bundle) { res.status(404).json({ error: "Employee not found." }); return; }
  const skillsResult = await db.execute(sql`SELECT scope_value FROM agent_execution_scopes WHERE agent_id = ${agentId} AND scope_type = 'skill' AND operation = 'use' ORDER BY scope_value`);
  const skills = (skillsResult.rows ?? []).map(row => String((row as Record<string, unknown>).scope_value || "")).filter(Boolean);
  const files = generateMarkdown(bundle.agent, bundle.projectName, bundle.profile);
  const slug = bundle.agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `agent-${agentId}`;
  res.setHeader("Content-Disposition", `attachment; filename=\"${slug}.agent.json\"`);
  res.json({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    agent: { name: bundle.agent.name, role: bundle.agent.role, department: bundle.agent.department, responsibilities: bundle.agent.responsibilities, project: bundle.projectName },
    profile: bundle.profile,
    markdown: files,
    dependencies: { assignedSkills: skills, runtimeType: bundle.runtimeType },
    security: { credentialsIncluded: false, note: "Credentials and secret values are intentionally excluded. Reconnect approved credentials in the destination system." },
  });
});

export default router;
