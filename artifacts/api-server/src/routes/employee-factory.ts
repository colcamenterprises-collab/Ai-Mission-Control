import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";
import { provisionEmployee } from "../services/agent-provisioner.js";
import { buildEmploymentPackFromRoleBrief, certifyEmploymentPack, employmentPackMarkdown } from "../services/agent-employment-pack.js";

const router: IRouter = Router();
const MAX_AVATAR_BYTES = 512_000;
const AVATAR_PUBLIC_PREFIX = "/api/employee-avatars/";
const PREVIOUS_AVATAR_PREFIX = "/api/employee-factory/avatar/";
const LEGACY_AVATAR_PREFIX = "/employee-avatars/";
const AVATAR_FILENAME_RE = /^[a-f0-9-]+\.(?:png|jpg|webp)$/;
const AVATAR_EXTENSIONS: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

function avatarDirectory() { const dataDir = process.env.MISSION_CONTROL_DATA_DIR || "/var/lib/ai-mission-control"; return path.join(dataDir, "avatars"); }
function numberOrNull(value: unknown): number | null { if (value === null || value === undefined || value === "") return null; const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function textOrNull(value: unknown): string | null { if (typeof value !== "string") return null; const trimmed = value.trim(); return trimmed || null; }
function avatarFilename(value: string | null): string | null { if (!value) return null; const prefixes = [AVATAR_PUBLIC_PREFIX, PREVIOUS_AVATAR_PREFIX, LEGACY_AVATAR_PREFIX]; const prefix = prefixes.find((candidate) => value.startsWith(candidate)); if (!prefix) return null; const filename = value.slice(prefix.length); return AVATAR_FILENAME_RE.test(filename) ? filename : null; }
function publicAvatarUrl(value: string | null): string | null { const filename = avatarFilename(value); return filename ? `${AVATAR_PUBLIC_PREFIX}${filename}` : null; }
function validateAvatarUrl(value: string | null): string | null { if (!value) return null; const canonical = publicAvatarUrl(value); if (!canonical) throw new Error("Employee photo reference is invalid. Upload the photo again."); return canonical; }
async function removeUploadedAvatar(avatarUrl: string | null) { const filename = avatarFilename(avatarUrl); if (!filename) return; await rm(path.join(avatarDirectory(), filename), { force: true }).catch(() => undefined); }

router.get("/employee-factory/projects", async (_req, res): Promise<void> => {
  const projects = await db.select({ id: projectsTable.id, name: projectsTable.name, description: projectsTable.description }).from(projectsTable).orderBy(projectsTable.name);
  res.json(projects);
});

router.get("/employee-factory/profiles", async (_req, res): Promise<void> => {
  const result = await db.execute(sql`SELECT agent_id AS "agentId", project_id AS "projectId", project_name AS "projectName", avatar_data_url AS "avatarUrl", created_at AS "createdAt", updated_at AS "updatedAt" FROM agent_employee_profiles ORDER BY agent_id`);
  const rows = (result.rows ?? []).map((row) => { const profile = row as Record<string, unknown>; const storedAvatar = typeof profile.avatarUrl === "string" ? profile.avatarUrl : null; return { ...profile, avatarUrl: publicAvatarUrl(storedAvatar) }; });
  res.json(rows);
});

router.post("/employee-factory/avatar", createRateLimit("admin-write", 20, 60_000), express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: MAX_AVATAR_BYTES }), async (req, res): Promise<void> => {
  try {
    const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase(); const extension = AVATAR_EXTENSIONS[contentType]; const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!extension) { res.status(415).json({ error: "Use a PNG, JPG or WebP employee photo." }); return; }
    if (!body.length) { res.status(400).json({ error: "Choose an employee photo to upload." }); return; }
    if (body.length > MAX_AVATAR_BYTES) { res.status(413).json({ error: "Employee photo is still too large after resizing. Choose a smaller image." }); return; }
    await mkdir(avatarDirectory(), { recursive: true }); const filename = `${randomUUID()}${extension}`; await writeFile(path.join(avatarDirectory(), filename), body, { flag: "wx" }); const avatarUrl = `${AVATAR_PUBLIC_PREFIX}${filename}`;
    await auditLog({ action: "uploaded", entityType: "agent_employee_avatar", entityId: filename, actorType: "admin", actorName: "Mission Control" }); res.status(201).json({ avatarUrl });
  } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "Mission Control could not save the employee photo." }); }
});

router.post("/employee-factory/hire", createRateLimit("admin-write", 10, 60_000), async (req, res): Promise<void> => {
  const name = textOrNull(req.body?.name); const role = textOrNull(req.body?.role); const department = textOrNull(req.body?.department) || "Operations"; const owner = textOrNull(req.body?.owner);
  const responsibilities = textOrNull(req.body?.responsibilities); const projectId = numberOrNull(req.body?.projectId); const runtimeHostId = numberOrNull(req.body?.runtimeHostId); const secretId = numberOrNull(req.body?.secretId); const templateId = numberOrNull(req.body?.templateId);
  const runtimeType = textOrNull(req.body?.runtimeType) || "openclaw"; const model = textOrNull(req.body?.model); let avatarUrl: string | null = null;
  if (!name || !role) { res.status(400).json({ error: "Employee name and job title are required." }); return; }
  if (!projectId) { res.status(400).json({ error: "Choose a Mission Control project for this employee." }); return; }
  if (!runtimeHostId) { res.status(400).json({ error: "Choose an available worker setup." }); return; }
  if (runtimeType !== "openclaw") { res.status(400).json({ error: "Automatic hiring is currently available for OpenClaw employees. Hermes can be shown as an option but cannot yet be provisioned automatically." }); return; }
  if (!secretId) { res.status(400).json({ error: "Choose an AI account for this employee." }); return; }

  try {
    avatarUrl = validateAvatarUrl(textOrNull(req.body?.avatarUrl));
    const [project] = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable).where(sql`${projectsTable.id} = ${projectId}`);
    if (!project) { await removeUploadedAvatar(avatarUrl); res.status(400).json({ error: "Selected project no longer exists." }); return; }
    const result = await provisionEmployee({ name, role, department, business: project.name, owner, responsibilities, runtimeHostId, runtimeType, provider: "openrouter", model, secretId, templateId });
    await db.execute(sql`INSERT INTO agent_employee_profiles (agent_id, project_id, project_name, avatar_data_url, updated_at) VALUES (${result.agent.id}, ${project.id}, ${project.name}, ${avatarUrl}, now()) ON CONFLICT (agent_id) DO UPDATE SET project_id = EXCLUDED.project_id, project_name = EXCLUDED.project_name, avatar_data_url = EXCLUDED.avatar_data_url, updated_at = now()`);

    const employment = buildEmploymentPackFromRoleBrief({ title: role, business: project.name, responsibilities, owner });
    const profile = {
      identity: { mission: employment.role.purpose, successDefinition: employment.success.outcomes },
      soul: { communicationStyle: employment.communication.ownerStyle, decisionStyle: "Evidence-first, role-accountable and policy-aware.", initiative: employment.delegations.autonomous, challengeOwner: employment.escalation.escalateWhen, principles: employment.success.qualityBar, neverDo: employment.boundaries.neverDo },
      operating: { autonomy: employment.delegations.autonomous, approvalRequired: employment.delegations.ownerApproval, completionStandard: employment.success.qualityBar, reportingStyle: employment.communication.reportingFormat },
      user: { managerName: owner || "Business Owner", communicationPreferences: employment.communication.ownerStyle, escalationRules: employment.escalation.escalateWhen },
      tools: { allowedTools: employment.systems.required, accessRules: employment.systems.accessRules },
      heartbeat: { recurringDuties: employment.responsibilities.recurring, alertConditions: employment.escalation.escalateWhen },
      memory: { seed: "" }, employment,
    };
    const generatedFiles = { ...employmentPackMarkdown(employment) };
    await db.execute(sql`INSERT INTO agent_profile_definitions (agent_id, profile_json, generated_files, version, updated_at) VALUES (${result.agent.id}, ${JSON.stringify(profile)}::jsonb, ${JSON.stringify(generatedFiles)}::jsonb, 1, now()) ON CONFLICT (agent_id) DO UPDATE SET profile_json = EXCLUDED.profile_json, generated_files = EXCLUDED.generated_files, version = agent_profile_definitions.version + 1, updated_at = now()`);

    const employmentCertification = certifyEmploymentPack(employment);
    await auditLog({ action: "hired", entityType: "agent_employee", entityId: result.agent.id, actorType: "admin", actorName: "Mission Control", metadata: `employmentReady=${employmentCertification.ready}; employmentScore=${employmentCertification.score}` });
    res.status(201).json({ ...result, profile: { agentId: result.agent.id, projectId: project.id, projectName: project.name, avatarUrl }, employment, employmentCertification });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mission Control could not finish hiring this employee."; await removeUploadedAvatar(avatarUrl);
    await auditLog({ action: "hire_failed", entityType: "agent_employee", entityId: name || "unknown", actorType: "admin", actorName: "Mission Control", metadata: `projectId=${projectId ?? "unknown"}; runtime=${runtimeType}; error=${message.slice(0, 500)}` }).catch(() => undefined);
    res.status(500).json({ error: message });
  }
});

router.put("/employee-factory/agents/:id/profile", createRateLimit("admin-write", 30, 60_000), async (req, res): Promise<void> => {
  const agentId = Number(req.params.id); if (!Number.isInteger(agentId) || agentId <= 0) { res.status(400).json({ error: "Invalid employee id." }); return; }
  try {
    const projectId = numberOrNull(req.body?.projectId); const projectName = textOrNull(req.body?.projectName); const avatarUrl = validateAvatarUrl(textOrNull(req.body?.avatarUrl));
    if (projectId) { const [project] = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable).where(sql`${projectsTable.id} = ${projectId}`); if (!project) { res.status(400).json({ error: "Selected project no longer exists." }); return; } if (projectName && project.name !== projectName) { res.status(400).json({ error: "Selected project does not match Mission Control's project record." }); return; } }
    const result = await db.execute(sql`INSERT INTO agent_employee_profiles (agent_id, project_id, project_name, avatar_data_url, updated_at) VALUES (${agentId}, ${projectId}, ${projectName}, ${avatarUrl}, now()) ON CONFLICT (agent_id) DO UPDATE SET project_id = EXCLUDED.project_id, project_name = EXCLUDED.project_name, avatar_data_url = EXCLUDED.avatar_data_url, updated_at = now() RETURNING agent_id AS "agentId", project_id AS "projectId", project_name AS "projectName", avatar_data_url AS "avatarUrl", updated_at AS "updatedAt"`);
    await auditLog({ action: "updated", entityType: "agent_employee_profile", entityId: agentId, actorType: "admin", actorName: "Mission Control" }); const row = (result.rows?.[0] ?? { agentId, projectId, projectName, avatarUrl }) as Record<string, unknown>; const storedAvatar = typeof row.avatarUrl === "string" ? row.avatarUrl : null; res.json({ ...row, avatarUrl: publicAvatarUrl(storedAvatar) });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Employee profile could not be saved." }); }
});

export default router;
