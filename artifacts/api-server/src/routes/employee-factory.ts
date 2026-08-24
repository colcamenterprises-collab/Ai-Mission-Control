import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";
import { provisionEmployee } from "../services/agent-provisioner.js";

const router: IRouter = Router();

const MAX_AVATAR_DATA_URL_LENGTH = 1_500_000;
const AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function validateAvatar(value: string | null): string | null {
  if (!value) return null;
  if (value.length > MAX_AVATAR_DATA_URL_LENGTH || !AVATAR_PATTERN.test(value)) {
    throw new Error("Employee image must be a PNG, JPG or WebP image under 1 MB.");
  }
  return value;
}

router.get("/employee-factory/projects", async (_req, res): Promise<void> => {
  const projects = await db.select({ id: projectsTable.id, name: projectsTable.name, description: projectsTable.description })
    .from(projectsTable)
    .orderBy(projectsTable.name);
  res.json(projects);
});

router.get("/employee-factory/profiles", async (_req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT agent_id AS "agentId", project_id AS "projectId", project_name AS "projectName",
           avatar_data_url AS "avatarDataUrl", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM agent_employee_profiles
    ORDER BY agent_id
  `);
  res.json(result.rows ?? []);
});

router.post("/employee-factory/hire", createRateLimit("admin-write", 10, 60_000), async (req, res): Promise<void> => {
  const name = textOrNull(req.body?.name);
  const role = textOrNull(req.body?.role);
  const department = textOrNull(req.body?.department) || "Operations";
  const owner = textOrNull(req.body?.owner);
  const responsibilities = textOrNull(req.body?.responsibilities);
  const projectId = numberOrNull(req.body?.projectId);
  const runtimeHostId = numberOrNull(req.body?.runtimeHostId);
  const secretId = numberOrNull(req.body?.secretId);
  const templateId = numberOrNull(req.body?.templateId);
  const runtimeType = textOrNull(req.body?.runtimeType) || "openclaw";
  const model = textOrNull(req.body?.model);

  if (!name || !role) { res.status(400).json({ error: "Employee name and job title are required." }); return; }
  if (!projectId) { res.status(400).json({ error: "Choose a Mission Control project for this employee." }); return; }
  if (!runtimeHostId) { res.status(400).json({ error: "Choose an available worker setup." }); return; }
  if (runtimeType !== "openclaw") {
    res.status(400).json({ error: "Automatic hiring is currently available for OpenClaw employees. Hermes can be shown as an option but cannot yet be provisioned automatically." });
    return;
  }
  if (!secretId) { res.status(400).json({ error: "Choose an AI account for this employee." }); return; }

  try {
    const avatarDataUrl = validateAvatar(textOrNull(req.body?.avatarDataUrl));
    const [project] = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable).where(sql`${projectsTable.id} = ${projectId}`);
    if (!project) { res.status(400).json({ error: "Selected project no longer exists." }); return; }

    const result = await provisionEmployee({
      name,
      role,
      department,
      business: project.name,
      owner,
      responsibilities,
      runtimeHostId,
      runtimeType,
      provider: "openrouter",
      model,
      secretId,
      templateId,
    });

    await db.execute(sql`
      INSERT INTO agent_employee_profiles (agent_id, project_id, project_name, avatar_data_url, updated_at)
      VALUES (${result.agent.id}, ${project.id}, ${project.name}, ${avatarDataUrl}, now())
      ON CONFLICT (agent_id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        project_name = EXCLUDED.project_name,
        avatar_data_url = EXCLUDED.avatar_data_url,
        updated_at = now()
    `);

    await auditLog({ action: "hired", entityType: "agent_employee", entityId: result.agent.id, actorType: "admin", actorName: "Mission Control" });
    res.status(201).json({ ...result, profile: { agentId: result.agent.id, projectId: project.id, projectName: project.name, avatarDataUrl } });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Mission Control could not finish hiring this employee." });
  }
});

router.put("/employee-factory/agents/:id/profile", createRateLimit("admin-write", 30, 60_000), async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  if (!Number.isInteger(agentId) || agentId <= 0) { res.status(400).json({ error: "Invalid employee id." }); return; }

  try {
    const projectId = numberOrNull(req.body?.projectId);
    const projectName = textOrNull(req.body?.projectName);
    const avatarDataUrl = validateAvatar(textOrNull(req.body?.avatarDataUrl));

    if (projectId) {
      const [project] = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable).where(sql`${projectsTable.id} = ${projectId}`);
      if (!project) { res.status(400).json({ error: "Selected project no longer exists." }); return; }
      if (projectName && project.name !== projectName) { res.status(400).json({ error: "Selected project does not match Mission Control's project record." }); return; }
    }

    const result = await db.execute(sql`
      INSERT INTO agent_employee_profiles (agent_id, project_id, project_name, avatar_data_url, updated_at)
      VALUES (${agentId}, ${projectId}, ${projectName}, ${avatarDataUrl}, now())
      ON CONFLICT (agent_id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        project_name = EXCLUDED.project_name,
        avatar_data_url = EXCLUDED.avatar_data_url,
        updated_at = now()
      RETURNING agent_id AS "agentId", project_id AS "projectId", project_name AS "projectName",
                avatar_data_url AS "avatarDataUrl", updated_at AS "updatedAt"
    `);

    await auditLog({ action: "updated", entityType: "agent_employee_profile", entityId: agentId, actorType: "admin", actorName: "Mission Control" });
    res.json(result.rows?.[0] ?? { agentId, projectId, projectName, avatarDataUrl });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Employee profile could not be saved." });
  }
});

export default router;
