import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agentsTable } from "@workspace/db";
import {
  ListAgentsResponse,
  CreateAgentBody,
  GetAgentParams,
  GetAgentResponse,
  UpdateAgentParams,
  UpdateAgentBody,
  UpdateAgentResponse,
} from "@workspace/api-zod";
import { serializeDates } from "../utils/serialize.js";

const router: IRouter = Router();

function maskApiKey(apiKey: string | null | undefined): string | null {
  if (!apiKey) return null;
  if (apiKey.length <= 4) return "••••";
  return "••••" + apiKey.slice(-4);
}

function maskAgentForResponse(agent: typeof agentsTable.$inferSelect) {
  const { apiKey, ...rest } = agent;
  return { ...rest, apiKeyHint: maskApiKey(apiKey) };
}

router.get("/agents", async (_req, res): Promise<void> => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  const masked = agents.map(maskAgentForResponse);
  res.json(ListAgentsResponse.parse(serializeDates(masked)));
});

router.post("/agents", async (req, res): Promise<void> => {
  const parsed = CreateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { apiKey, ...rest } = parsed.data;
  const insertData = {
    ...rest,
    apiKey: apiKey ?? null,
    lastActive: "just now",
    status: "idle" as const,
    isPluggedIn: rest.isPluggedIn ?? false,
  };
  const [agent] = await db.insert(agentsTable).values(insertData).returning();
  res.status(201).json(GetAgentResponse.parse(serializeDates(maskAgentForResponse(agent))));
});

router.get("/agents/:id", async (req, res): Promise<void> => {
  const params = GetAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, params.data.id));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(GetAgentResponse.parse(serializeDates(maskAgentForResponse(agent))));
});

router.patch("/agents/:id", async (req, res): Promise<void> => {
  const params = UpdateAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { apiKey, ...rest } = parsed.data;
  const updateData: Partial<typeof agentsTable.$inferInsert> = { ...rest };
  if (apiKey !== undefined) {
    updateData.apiKey = apiKey;
  }
  const [agent] = await db.update(agentsTable).set(updateData).where(eq(agentsTable.id, params.data.id)).returning();
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(UpdateAgentResponse.parse(serializeDates(maskAgentForResponse(agent))));
});

router.delete("/agents/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [agent] = await db.delete(agentsTable).where(eq(agentsTable.id, id)).returning();
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
