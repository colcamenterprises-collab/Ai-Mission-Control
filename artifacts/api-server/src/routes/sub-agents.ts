import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, agentSessionsTable } from "@workspace/db";
import { SUB_AGENT_PROFILES } from "../config-sub-agent-profiles.js";
import { serializeDates } from "../utils/serialize.js";

const router: IRouter = Router();

router.get("/sub-agents/profiles", (_req, res): void => {
  res.json(SUB_AGENT_PROFILES);
});

router.get("/sub-agents/sessions", async (_req, res): Promise<void> => {
  const sessions = await db.select().from(agentSessionsTable).orderBy(desc(agentSessionsTable.startedAt));
  res.json(serializeDates(sessions));
});

router.post("/sub-agents/sessions", async (req, res): Promise<void> => {
  const profileId = typeof req.body?.profileId === "string" ? req.body.profileId.trim() : "";
  const profile = SUB_AGENT_PROFILES.find(item => item.id === profileId);
  if (!profile) { res.status(400).json({ error: "Unknown sub-agent profile" }); return; }
  const taskId = Number.isInteger(Number(req.body?.taskId)) ? Number(req.body.taskId) : null;
  const context = req.body?.context && typeof req.body.context === "object" ? req.body.context as Record<string, unknown> : {};
  const [session] = await db.insert(agentSessionsTable).values({ profileId, taskId, status: "working", context }).returning();
  res.status(201).json(serializeDates({ ...session, profile }));
});

router.post("/sub-agents/sessions/:id/complete", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid session id" }); return; }
  const result = req.body?.result && typeof req.body.result === "object" ? req.body.result as Record<string, unknown> : {};
  const [session] = await db.update(agentSessionsTable).set({ status: "completed", result, endedAt: new Date() }).where(eq(agentSessionsTable.id, id)).returning();
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  res.json(serializeDates(session));
});

router.post("/sub-agents/sessions/:id/fail", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid session id" }); return; }
  const result = req.body?.result && typeof req.body.result === "object" ? req.body.result as Record<string, unknown> : {};
  const [session] = await db.update(agentSessionsTable).set({ status: "failed", result, endedAt: new Date() }).where(eq(agentSessionsTable.id, id)).returning();
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  res.json(serializeDates(session));
});

export default router;
