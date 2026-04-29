import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, contentTable } from "@workspace/db";
import {
  ListContentResponse,
  CreateContentBody,
  GetContentParams,
  GetContentResponse,
  UpdateContentParams,
  UpdateContentBody,
  UpdateContentResponse,
  DeleteContentParams,
  MoveContentParams,
  MoveContentBody,
  MoveContentResponse,
  GetContentPipelineSummaryResponse,
  ListContentQueryParams,
} from "@workspace/api-zod";
import { serializeDates } from "../utils/serialize.js";

const router: IRouter = Router();

router.get("/content/pipeline/summary", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ stage: contentTable.stage, count: sql<number>`count(*)::int` })
    .from(contentTable)
    .groupBy(contentTable.stage);
  res.json(GetContentPipelineSummaryResponse.parse(rows));
});

router.get("/content", async (req, res): Promise<void> => {
  const query = ListContentQueryParams.safeParse(req.query);
  const filters = [];
  if (query.success) {
    if (query.data.stage) filters.push(eq(contentTable.stage, query.data.stage));
    if (query.data.platform) filters.push(eq(contentTable.platform, query.data.platform));
  }
  const items = await db.select().from(contentTable).where(filters.length ? and(...filters) : undefined).orderBy(contentTable.createdAt);
  res.json(ListContentResponse.parse(serializeDates(items)));
});

router.post("/content", async (req, res): Promise<void> => {
  const parsed = CreateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.insert(contentTable).values(parsed.data).returning();
  res.status(201).json(GetContentResponse.parse(serializeDates(item)));
});

router.get("/content/:id", async (req, res): Promise<void> => {
  const params = GetContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db.select().from(contentTable).where(eq(contentTable.id, params.data.id));
  if (!item) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.json(GetContentResponse.parse(serializeDates(item)));
});

router.patch("/content/:id", async (req, res): Promise<void> => {
  const params = UpdateContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.update(contentTable).set(parsed.data).where(eq(contentTable.id, params.data.id)).returning();
  if (!item) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.json(UpdateContentResponse.parse(serializeDates(item)));
});

router.delete("/content/:id", async (req, res): Promise<void> => {
  const params = DeleteContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db.delete(contentTable).where(eq(contentTable.id, params.data.id)).returning();
  if (!item) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.sendStatus(204);
});

router.patch("/content/:id/move", async (req, res): Promise<void> => {
  const params = MoveContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = MoveContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.update(contentTable).set({ stage: parsed.data.stage }).where(eq(contentTable.id, params.data.id)).returning();
  if (!item) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.json(MoveContentResponse.parse(serializeDates(item)));
});

export default router;
