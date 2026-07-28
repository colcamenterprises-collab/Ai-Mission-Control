import { decryptSecret, encryptSecret } from "../lib/security.js";
import { auditLog } from "../lib/audit.js";
import { createRateLimit } from "../lib/rate-limit.js";
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, integrationsTable, agentIntegrationsTable, agentsTable } from "@workspace/db";
import {
  ListIntegrationsResponse,
  CreateIntegrationBody,
  GetIntegrationParams,
  GetIntegrationResponse,
  UpdateIntegrationParams,
  UpdateIntegrationBody,
  UpdateIntegrationResponse,
  DeleteIntegrationParams,
  ListIntegrationAgentsParams,
  ListIntegrationAgentsResponse,
  AssignAgentToIntegrationParams,
  AssignAgentToIntegrationBody,
  UnassignAgentFromIntegrationParams,
  ListAgentIntegrationsParams,
  ListAgentIntegrationsResponse,
} from "@workspace/api-zod";
import { serializeDates } from "../utils/serialize.js";

const router: IRouter = Router();

function maskKey(k: string | null | undefined): string | null {
  if (!k) return null;
  return "••••" + k.slice(-4);
}

function maskIntegration(row: typeof integrationsTable.$inferSelect) {
  const { apiKey, ...rest } = row;
  return { ...rest, apiKeyHint: maskKey(decryptSecret(apiKey)) };
}

router.get("/integrations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(integrationsTable).orderBy(integrationsTable.createdAt);
  res.json(ListIntegrationsResponse.parse(serializeDates(rows.map(maskIntegration))));
});

router.post("/integrations", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const parsed = CreateIntegrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { apiKey, ...rest } = parsed.data;
  const [row] = await db.insert(integrationsTable).values({
    ...rest,
    apiKey: encryptSecret(apiKey ?? null),
    iconColor: rest.iconColor ?? "from-slate-600 to-slate-800",
    isPublic: rest.isPublic ?? false,
  }).returning();
  await auditLog({ action: "created", entityType: "integration credential", entityId: row.id, actorType: "admin" });
  res.status(201).json(serializeDates(maskIntegration(row)));
});

router.get("/integrations/:id", async (req, res): Promise<void> => {
  const params = GetIntegrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Integration not found" });
    return;
  }
  const assignments = await db
    .select({
      id: agentIntegrationsTable.id,
      agentId: agentIntegrationsTable.agentId,
      integrationId: agentIntegrationsTable.integrationId,
      role: agentIntegrationsTable.role,
      assignedAt: agentIntegrationsTable.assignedAt,
      agentName: agentsTable.name,
      agentAvatarInitials: agentsTable.avatarInitials,
      agentStatus: agentsTable.status,
    })
    .from(agentIntegrationsTable)
    .innerJoin(agentsTable, eq(agentIntegrationsTable.agentId, agentsTable.id))
    .where(eq(agentIntegrationsTable.integrationId, params.data.id));

  res.json(GetIntegrationResponse.parse(serializeDates({ ...maskIntegration(row), agents: assignments })));
});

router.patch("/integrations/:id", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const params = UpdateIntegrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateIntegrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { apiKey, ...rest } = parsed.data;
  const updateData: Partial<typeof integrationsTable.$inferInsert> = { ...rest };
  if (apiKey !== undefined) updateData.apiKey = encryptSecret(apiKey);

  const [row] = await db.update(integrationsTable).set(updateData).where(eq(integrationsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Integration not found" });
    return;
  }
  await auditLog({ action: "updated", entityType: "integration credential", entityId: row.id, actorType: "admin" });
  res.json(UpdateIntegrationResponse.parse(serializeDates(maskIntegration(row))));
});

router.delete("/integrations/:id", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const params = DeleteIntegrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(agentIntegrationsTable).where(eq(agentIntegrationsTable.integrationId, params.data.id));
  const [row] = await db.delete(integrationsTable).where(eq(integrationsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Integration not found" });
    return;
  }
  await auditLog({ action: "deleted", entityType: "integration credential", entityId: row.id, actorType: "admin" });
  res.sendStatus(204);
});

router.get("/integrations/:id/agents", async (req, res): Promise<void> => {
  const params = ListIntegrationAgentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const assignments = await db
    .select({
      id: agentIntegrationsTable.id,
      agentId: agentIntegrationsTable.agentId,
      integrationId: agentIntegrationsTable.integrationId,
      role: agentIntegrationsTable.role,
      assignedAt: agentIntegrationsTable.assignedAt,
      agentName: agentsTable.name,
      agentAvatarInitials: agentsTable.avatarInitials,
      agentStatus: agentsTable.status,
    })
    .from(agentIntegrationsTable)
    .innerJoin(agentsTable, eq(agentIntegrationsTable.agentId, agentsTable.id))
    .where(eq(agentIntegrationsTable.integrationId, params.data.id));

  res.json(ListIntegrationAgentsResponse.parse(serializeDates(assignments)));
});

router.post("/integrations/:id/agents", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const params = AssignAgentToIntegrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AssignAgentToIntegrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await db.select().from(agentIntegrationsTable)
    .where(and(
      eq(agentIntegrationsTable.integrationId, params.data.id),
      eq(agentIntegrationsTable.agentId, parsed.data.agentId)
    ));
  if (existing.length > 0) {
    res.status(409).json({ error: "Agent already assigned to this integration" });
    return;
  }
  const [assignment] = await db.insert(agentIntegrationsTable).values({
    integrationId: params.data.id,
    agentId: parsed.data.agentId,
    role: parsed.data.role ?? null,
  }).returning();

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, parsed.data.agentId));
  res.status(201).json(serializeDates({
    ...assignment,
    agentName: agent?.name ?? "Unknown",
    agentAvatarInitials: agent?.avatarInitials ?? "??",
    agentStatus: agent?.status ?? "idle",
  }));
});

router.delete("/integrations/:id/agents/:agentId", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const params = UnassignAgentFromIntegrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(agentIntegrationsTable).where(
    and(
      eq(agentIntegrationsTable.integrationId, params.data.id),
      eq(agentIntegrationsTable.agentId, params.data.agentId)
    )
  );
  res.sendStatus(204);
});

router.get("/agents/:id/integrations", async (req, res): Promise<void> => {
  const params = ListAgentIntegrationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select({ integration: integrationsTable })
    .from(agentIntegrationsTable)
    .innerJoin(integrationsTable, eq(agentIntegrationsTable.integrationId, integrationsTable.id))
    .where(eq(agentIntegrationsTable.agentId, params.data.id));

  const integrations = rows.map(r => maskIntegration(r.integration));
  res.json(ListAgentIntegrationsResponse.parse(serializeDates(integrations)));
});

export default router;
