import { decryptSecret, encryptSecret } from "../lib/security.js";
import { auditLog } from "../lib/audit.js";
import { createRateLimit } from "../lib/rate-limit.js";
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, agentToolsTable, agentToolAccessTable, agentsTable } from "@workspace/db";
import {
  ListToolsResponse,
  CreateToolBody,
  UpdateToolParams,
  UpdateToolBody,
  UpdateToolResponse,
  DeleteToolParams,
  ListToolAgentsParams,
  ListToolAgentsResponse,
  GrantToolAccessParams,
  GrantToolAccessBody,
  RevokeToolAccessParams,
  ListAgentToolsParams,
  ListAgentToolsResponse,
} from "@workspace/api-zod";
import { serializeDates } from "../utils/serialize.js";

const router: IRouter = Router();

function mask(val: string | null | undefined): string | null {
  if (!val) return null;
  return "••••" + val.slice(-4);
}

function maskTool(row: typeof agentToolsTable.$inferSelect) {
  const { apiKey, username, password, ...rest } = row;
  return {
    ...rest,
    apiKeyHint: mask(decryptSecret(apiKey)),
    usernameHint: mask(decryptSecret(username)),
    passwordHint: mask(decryptSecret(password)),
  };
}

/* ─── LIST ──────────────────────────────────────────────────────── */
router.get("/tools", async (_req, res): Promise<void> => {
  const rows = await db.select().from(agentToolsTable).orderBy(agentToolsTable.createdAt);
  res.json(ListToolsResponse.parse(serializeDates(rows.map(maskTool))));
});

/* ─── CREATE ────────────────────────────────────────────────────── */
router.post("/tools", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const parsed = CreateToolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { apiKey, username, password, ...rest } = parsed.data;
  const [row] = await db.insert(agentToolsTable).values({
    ...rest,
    apiKey: encryptSecret(apiKey ?? null),
    username: encryptSecret(username ?? null),
    password: encryptSecret(password ?? null),
    isActive: true,
  }).returning();
  await auditLog({ action: "created", entityType: "credential", entityId: row.id, actorType: "admin" });
  res.status(201).json(serializeDates(maskTool(row)));
});

/* ─── UPDATE ────────────────────────────────────────────────────── */
router.patch("/tools/:id", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const params = UpdateToolParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateToolBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { apiKey, username, password, ...rest } = parsed.data;
  const updateData: Partial<typeof agentToolsTable.$inferInsert> = { ...rest };
  if (apiKey !== undefined) updateData.apiKey = encryptSecret(apiKey);
  if (username !== undefined) updateData.username = encryptSecret(username);
  if (password !== undefined) updateData.password = encryptSecret(password);

  const [row] = await db.update(agentToolsTable).set(updateData)
    .where(eq(agentToolsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Tool not found" }); return; }
  await auditLog({ action: "updated", entityType: "credential", entityId: row.id, actorType: "admin" });
  res.json(UpdateToolResponse.parse(serializeDates(maskTool(row))));
});

/* ─── DELETE ────────────────────────────────────────────────────── */
router.delete("/tools/:id", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const params = DeleteToolParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(agentToolAccessTable).where(eq(agentToolAccessTable.toolId, params.data.id));
  const [row] = await db.delete(agentToolsTable).where(eq(agentToolsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Tool not found" }); return; }
  await auditLog({ action: "deleted", entityType: "credential", entityId: row.id, actorType: "admin" });
  res.sendStatus(204);
});

/* ─── LIST AGENTS WITH ACCESS TO TOOL ──────────────────────────── */
router.get("/tools/:id/agents", async (req, res): Promise<void> => {
  const params = ListToolAgentsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const rows = await db
    .select({
      id: agentToolAccessTable.id,
      agentId: agentToolAccessTable.agentId,
      toolId: agentToolAccessTable.toolId,
      grantedAt: agentToolAccessTable.grantedAt,
      agentName: agentsTable.name,
      agentAvatarInitials: agentsTable.avatarInitials,
      agentStatus: agentsTable.status,
    })
    .from(agentToolAccessTable)
    .innerJoin(agentsTable, eq(agentToolAccessTable.agentId, agentsTable.id))
    .where(eq(agentToolAccessTable.toolId, params.data.id));
  res.json(ListToolAgentsResponse.parse(serializeDates(rows)));
});

/* ─── GRANT ACCESS ──────────────────────────────────────────────── */
router.post("/tools/:id/agents", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const params = GrantToolAccessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = GrantToolAccessBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await db.select().from(agentToolAccessTable).where(
    and(
      eq(agentToolAccessTable.toolId, params.data.id),
      eq(agentToolAccessTable.agentId, parsed.data.agentId),
    )
  );
  if (existing.length > 0) {
    res.status(409).json({ error: "Agent already has access to this tool" });
    return;
  }
  const [access] = await db.insert(agentToolAccessTable).values({
    toolId: params.data.id,
    agentId: parsed.data.agentId,
  }).returning();
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, parsed.data.agentId));
  await auditLog({ action: "granted", entityType: "credential access", entityId: params.data.id, actorType: "admin", metadata: `agentId=${parsed.data.agentId}` });
  res.status(201).json(serializeDates({
    ...access,
    agentName: agent?.name ?? "Unknown",
    agentAvatarInitials: agent?.avatarInitials ?? "??",
    agentStatus: agent?.status ?? "idle",
  }));
});

/* ─── REVOKE ACCESS ─────────────────────────────────────────────── */
router.delete("/tools/:id/agents/:agentId", createRateLimit("admin-write", 40, 60_000), async (req, res): Promise<void> => {
  const params = RevokeToolAccessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(agentToolAccessTable).where(
    and(
      eq(agentToolAccessTable.toolId, params.data.id),
      eq(agentToolAccessTable.agentId, params.data.agentId),
    )
  );
  await auditLog({ action: "revoked", entityType: "credential access", entityId: params.data.id, actorType: "admin", metadata: `agentId=${params.data.agentId}` });
  res.sendStatus(204);
});

/* ─── AGENT'S TOOL LIST (masked, for UI) ───────────────────────── */
router.get("/agents/:id/tools", async (req, res): Promise<void> => {
  const params = ListAgentToolsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const rows = await db
    .select({ tool: agentToolsTable })
    .from(agentToolAccessTable)
    .innerJoin(agentToolsTable, eq(agentToolAccessTable.toolId, agentToolsTable.id))
    .where(eq(agentToolAccessTable.agentId, params.data.id));
  const tools = rows.map(r => maskTool(r.tool));
  res.json(ListAgentToolsResponse.parse(serializeDates(tools)));
});

export default router;
