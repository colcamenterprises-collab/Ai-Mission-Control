import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";

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

router.put("/employee-factory/agents/:id/profile", createRateLimit("admin-write", 30, 60_000), async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    res.status(400).json({ error: "Invalid employee id." });
    return;
  }

  const projectId = numberOrNull(req.body?.projectId);
  const projectName = textOrNull(req.body?.projectName);
  const avatarDataUrl = textOrNull(req.body?.avatarDataUrl);

  if (avatarDataUrl && (avatarDataUrl.length > MAX_AVATAR_DATA_URL_LENGTH || !AVATAR_PATTERN.test(avatarDataUrl))) {
    res.status(400).json({ error: "Employee image must be a PNG, JPG or WebP image under 1 MB." });
    return;
  }

  if (projectId) {
    const [project] = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable).where(sql`${projectsTable.id} = ${projectId}`);
    if (!project) {
      res.status(400).json({ error: "Selected project no longer exists." });
      return;
    }
    if (projectName && project.name !== projectName) {
      res.status(400).json({ error: "Selected project does not match Mission Control's project record." });
      return;
    }
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
});

export default router;
