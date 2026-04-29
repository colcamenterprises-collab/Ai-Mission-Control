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

router.get("/agents", async (_req, res): Promise<void> => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  res.json(ListAgentsResponse.parse(serializeDates(agents)));
});

router.post("/agents", async (req, res): Promise<void> => {
  const parsed = CreateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [agent] = await db.insert(agentsTable).values(parsed.data).returning();
  res.status(201).json(GetAgentResponse.parse(serializeDates(agent)));
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
  res.json(GetAgentResponse.parse(serializeDates(agent)));
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
  const [agent] = await db.update(agentsTable).set(parsed.data).where(eq(agentsTable.id, params.data.id)).returning();
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(UpdateAgentResponse.parse(serializeDates(agent)));
});

export default router;
