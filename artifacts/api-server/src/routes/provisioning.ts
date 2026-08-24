import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  agentsTable,
  runtimeHostsTable,
  secretsVaultTable,
  employeeTemplatesTable,
  agentRuntimeInstancesTable,
  agentSecretGrantsTable,
} from "@workspace/db";
import { encryptSecret } from "../lib/security.js";
import { auditLog } from "../lib/audit.js";
import { createRateLimit } from "../lib/rate-limit.js";
import { provisionEmployee, runtimeAction } from "../services/agent-provisioner.js";

const router: IRouter = Router();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function secretHint(value: string): string {
  if (!value) return "configured";
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

router.get("/provisioning/overview", async (_req, res): Promise<void> => {
  const [hosts, secrets, templates, instances, agents] = await Promise.all([
    db.select().from(runtimeHostsTable).orderBy(runtimeHostsTable.id),
    db.select({
      id: secretsVaultTable.id,
      name: secretsVaultTable.name,
      kind: secretsVaultTable.kind,
      provider: secretsVaultTable.provider,
      valueHint: secretsVaultTable.valueHint,
      status: secretsVaultTable.status,
      createdAt: secretsVaultTable.createdAt,
      updatedAt: secretsVaultTable.updatedAt,
    }).from(secretsVaultTable).orderBy(secretsVaultTable.id),
    db.select().from(employeeTemplatesTable).where(eq(employeeTemplatesTable.isActive, true)).orderBy(employeeTemplatesTable.id),
    db.select().from(agentRuntimeInstancesTable).orderBy(desc(agentRuntimeInstancesTable.id)),
    db.select({ id: agentsTable.id, name: agentsTable.name, role: agentsTable.role, department: agentsTable.department, status: agentsTable.status, isPluggedIn: agentsTable.isPluggedIn }).from(agentsTable).orderBy(agentsTable.id),
  ]);
  res.json({ hosts, secrets, templates, instances, agents });
});

router.post("/provisioning/secrets", createRateLimit("admin-write", 20, 60_000), async (req, res): Promise<void> => {
  const name = text(req.body?.name);
  const value = text(req.body?.value);
  const kind = text(req.body?.kind) || "api_key";
  const provider = text(req.body?.provider) || null;
  if (!name || !value) {
    res.status(400).json({ error: "Secret name and value are required." });
    return;
  }

  try {
    const [secret] = await db.insert(secretsVaultTable).values({
      name,
      kind,
      provider,
      encryptedValue: encryptSecret(value)!,
      valueHint: secretHint(value),
      status: "active",
    }).returning();
    await auditLog({ action: "created", entityType: "secret", entityId: secret.id, actorType: "admin", actorName: "Mission Control" });
    res.status(201).json({ id: secret.id, name: secret.name, kind: secret.kind, provider: secret.provider, valueHint: secret.valueHint, status: secret.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to store secret.";
    res.status(400).json({ error: message.includes("unique") ? "A secret with that name already exists." : message });
  }
});

router.patch("/provisioning/secrets/:id", createRateLimit("admin-write", 20, 60_000), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid secret id." }); return; }
  const value = text(req.body?.value);
  const status = text(req.body?.status);
  const updates: Partial<typeof secretsVaultTable.$inferInsert> = { updatedAt: new Date() };
  if (value) {
    updates.encryptedValue = encryptSecret(value)!;
    updates.valueHint = secretHint(value);
  }
  if (status) updates.status = status;
  const [secret] = await db.update(secretsVaultTable).set(updates).where(eq(secretsVaultTable.id, id)).returning();
  if (!secret) { res.status(404).json({ error: "Secret not found." }); return; }
  await auditLog({ action: "updated", entityType: "secret", entityId: id, actorType: "admin", actorName: "Mission Control" });
  res.json({ id: secret.id, name: secret.name, kind: secret.kind, provider: secret.provider, valueHint: secret.valueHint, status: secret.status });
});

router.post("/provisioning/runtime-hosts", createRateLimit("admin-write", 20, 60_000), async (req, res): Promise<void> => {
  const name = text(req.body?.name);
  const runtimeType = text(req.body?.runtimeType);
  const rootDir = text(req.body?.rootDir);
  if (!name || !runtimeType || !rootDir) { res.status(400).json({ error: "Name, runtime type and root directory are required." }); return; }
  const [host] = await db.insert(runtimeHostsTable).values({
    name,
    runtimeType,
    hostType: text(req.body?.hostType) || "local",
    rootDir,
    cliPath: text(req.body?.cliPath) || null,
    status: "unknown",
    capabilities: typeof req.body?.capabilities === "object" && req.body.capabilities ? req.body.capabilities : {},
  }).returning();
  await auditLog({ action: "created", entityType: "runtime_host", entityId: host.id, actorType: "admin", actorName: "Mission Control" });
  res.status(201).json(host);
});

router.post("/provisioning/templates", createRateLimit("admin-write", 20, 60_000), async (req, res): Promise<void> => {
  const name = text(req.body?.name);
  const runtimeType = text(req.body?.runtimeType);
  if (!name || !runtimeType) { res.status(400).json({ error: "Template name and runtime type are required." }); return; }
  const [template] = await db.insert(employeeTemplatesTable).values({
    name,
    description: text(req.body?.description) || null,
    runtimeType,
    provider: text(req.body?.provider) || null,
    model: text(req.body?.model) || null,
    department: text(req.body?.department) || null,
    identityTemplate: text(req.body?.identityTemplate) || null,
    soulTemplate: text(req.body?.soulTemplate) || null,
    agentTemplate: text(req.body?.agentTemplate) || null,
    userTemplate: text(req.body?.userTemplate) || null,
    skillNames: Array.isArray(req.body?.skillNames) ? req.body.skillNames : [],
    defaultPermissions: typeof req.body?.defaultPermissions === "object" && req.body.defaultPermissions ? req.body.defaultPermissions : {},
  }).returning();
  await auditLog({ action: "created", entityType: "employee_template", entityId: template.id, actorType: "admin", actorName: "Mission Control" });
  res.status(201).json(template);
});

router.post("/provisioning/employees", createRateLimit("admin-write", 10, 60_000), async (req, res): Promise<void> => {
  const name = text(req.body?.name);
  const role = text(req.body?.role);
  const department = text(req.body?.department) || "Operations";
  const runtimeHostId = numberOrNull(req.body?.runtimeHostId);
  if (!name || !role || !runtimeHostId) {
    res.status(400).json({ error: "Name, role and runtime host are required." });
    return;
  }

  try {
    const result = await provisionEmployee({
      name,
      role,
      department,
      business: text(req.body?.business) || null,
      owner: text(req.body?.owner) || null,
      responsibilities: text(req.body?.responsibilities) || null,
      runtimeHostId,
      runtimeType: text(req.body?.runtimeType) || null,
      provider: text(req.body?.provider) || null,
      model: text(req.body?.model) || null,
      secretId: numberOrNull(req.body?.secretId),
      templateId: numberOrNull(req.body?.templateId),
    });
    await auditLog({ action: "provisioned", entityType: "agent", entityId: result.agent.id, actorType: "admin", actorName: "Mission Control" });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Employee provisioning failed." });
  }
});

router.post("/provisioning/agents/:id/runtime/:action", createRateLimit("admin-write", 20, 60_000), async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  const action = req.params.action as "start" | "stop" | "restart" | "health" | "decommission";
  if (!Number.isInteger(agentId)) { res.status(400).json({ error: "Invalid agent id." }); return; }
  if (!["start", "stop", "restart", "health", "decommission"].includes(action)) { res.status(400).json({ error: "Unsupported runtime action." }); return; }
  try {
    const result = await runtimeAction(agentId, action);
    await auditLog({ action, entityType: "agent_runtime", entityId: agentId, actorType: "admin", actorName: "Mission Control" });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Runtime action failed." });
  }
});

router.get("/provisioning/agents/:id/secrets", async (req, res): Promise<void> => {
  const agentId = Number(req.params.id);
  if (!Number.isInteger(agentId)) { res.status(400).json({ error: "Invalid agent id." }); return; }
  const grants = await db.select({
    id: agentSecretGrantsTable.id,
    purpose: agentSecretGrantsTable.purpose,
    secretId: secretsVaultTable.id,
    name: secretsVaultTable.name,
    provider: secretsVaultTable.provider,
    valueHint: secretsVaultTable.valueHint,
    status: secretsVaultTable.status,
  }).from(agentSecretGrantsTable)
    .innerJoin(secretsVaultTable, eq(agentSecretGrantsTable.secretId, secretsVaultTable.id))
    .where(eq(agentSecretGrantsTable.agentId, agentId));
  res.json(grants);
});

export default router;
