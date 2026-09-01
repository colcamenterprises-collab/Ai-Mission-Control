import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, agentsTable } from "@workspace/db";
import { buildAmandaEmploymentPack, certifyAmandaFinancialController } from "../services/amanda-financial-controller.js";
import { certifyEmploymentPack, employmentPackMarkdown } from "../services/agent-employment-pack.js";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";

const router: IRouter = Router();

async function findAmanda() {
  const rows = await db.select().from(agentsTable).where(eq(agentsTable.name, "Amanda"));
  return rows.find(agent => /financial controller/i.test(agent.role)) ?? rows[0] ?? null;
}

async function liveSystemNames(agentId: number): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT i.name
    FROM integrations i
    JOIN agent_integrations ai ON ai.integration_id = i.id
    WHERE ai.agent_id = ${agentId} AND lower(coalesce(i.status, '')) = 'connected'
    UNION
    SELECT t.name
    FROM tools t
    JOIN agent_tools at ON at.tool_id = t.id
    WHERE at.agent_id = ${agentId} AND lower(coalesce(t.status, '')) = 'connected'
  `);
  return (result.rows ?? []).map(row => String((row as Record<string, unknown>).name ?? "")).filter(Boolean);
}

router.get("/employee-factory/amanda/certification", async (_req, res): Promise<void> => {
  const amanda = await findAmanda();
  if (!amanda) { res.status(404).json({ error: "Amanda employee record not found." }); return; }
  const availableSystems = await liveSystemNames(amanda.id);
  const result = await db.execute(sql`SELECT profile_json FROM agent_profile_definitions WHERE agent_id = ${amanda.id} LIMIT 1`);
  const profileJson = ((result.rows?.[0] as Record<string, unknown> | undefined)?.profile_json ?? {}) as Record<string, unknown>;
  const certificationEvidence = (profileJson.amandaCertification && typeof profileJson.amandaCertification === "object" ? profileJson.amandaCertification : {}) as Record<string, boolean>;
  const employment = buildAmandaEmploymentPack();
  res.json({
    agentId: amanda.id,
    employmentCertification: certifyEmploymentPack(employment),
    operationalCertification: certifyAmandaFinancialController({ availableSystems, demonstrated: certificationEvidence }),
    availableSystems,
    note: "READY requires live granted access plus demonstrated role workflow. Profile text alone never certifies system access.",
  });
});

router.post("/employee-factory/amanda/apply-role-pack", createRateLimit("admin-write", 10, 60_000), async (_req, res): Promise<void> => {
  const amanda = await findAmanda();
  if (!amanda) { res.status(404).json({ error: "Amanda employee record not found." }); return; }
  const employment = buildAmandaEmploymentPack();
  const existing = await db.execute(sql`SELECT profile_json FROM agent_profile_definitions WHERE agent_id = ${amanda.id} LIMIT 1`);
  const current = ((existing.rows?.[0] as Record<string, unknown> | undefined)?.profile_json ?? {}) as Record<string, unknown>;
  const profile = { ...current, employment };
  const generatedFiles = employmentPackMarkdown(employment);
  await db.execute(sql`
    INSERT INTO agent_profile_definitions (agent_id, profile_json, generated_files, version, updated_at)
    VALUES (${amanda.id}, ${JSON.stringify(profile)}::jsonb, ${JSON.stringify(generatedFiles)}::jsonb, 1, now())
    ON CONFLICT (agent_id) DO UPDATE SET
      profile_json = agent_profile_definitions.profile_json || ${JSON.stringify({ employment })}::jsonb,
      generated_files = agent_profile_definitions.generated_files || ${JSON.stringify(generatedFiles)}::jsonb,
      version = agent_profile_definitions.version + 1,
      updated_at = now()
  `);
  await auditLog({ action: "amanda_financial_controller_pack_applied", entityType: "agent_profile", entityId: amanda.id, actorType: "admin", actorName: "Mission Control", metadata: "Ground Zero Patch 1.2 role pack applied; live access remains separately certified." });
  res.json({ agentId: amanda.id, employmentCertification: certifyEmploymentPack(employment), generatedFiles: Object.keys(generatedFiles) });
});

export default router;
