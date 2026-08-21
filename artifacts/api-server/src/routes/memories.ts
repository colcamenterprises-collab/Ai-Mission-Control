import { Router, type IRouter } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db, memoriesTable, memoryMetadataTable, memoryRevisionsTable } from "@workspace/db";
import {
  ListMemoriesResponse,
  CreateMemoryBody,
  GetMemoryParams,
  GetMemoryResponse,
  UpdateMemoryParams,
  UpdateMemoryBody,
  UpdateMemoryResponse,
  DeleteMemoryParams,
  ListMemoriesQueryParams,
} from "@workspace/api-zod";
import { serializeDates } from "../utils/serialize.js";
import { syncMemorySources } from "../services/memory-sync.js";

const router: IRouter = Router();

router.get("/memories", async (req, res): Promise<void> => {
  try { await syncMemorySources(); } catch (error) { console.error("Memory source sync failed", error); }
  const query = ListMemoriesQueryParams.safeParse(req.query);
  const filters = [];
  if (query.success) {
    if (query.data.category) filters.push(eq(memoriesTable.category, query.data.category));
    if (query.data.search) filters.push(or(ilike(memoriesTable.title, `%${query.data.search}%`), ilike(memoriesTable.content, `%${query.data.search}%`))!);
  }
  const memories = await db.select().from(memoriesTable).where(filters.length ? and(...filters) : undefined).orderBy(memoriesTable.createdAt);
  res.json(ListMemoriesResponse.parse(serializeDates(memories)));
});

router.post("/memories/sync", async (_req, res): Promise<void> => {
  try { res.json(await syncMemorySources({ force: true })); }
  catch (error) { console.error("Memory source sync failed", error); res.status(500).json({ error: "Memory source sync failed" }); }
});

router.post("/memories", async (req, res): Promise<void> => {
  const parsed = CreateMemoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const preview = parsed.data.content.slice(0, 150);
  const memory = await db.transaction(async (transaction) => {
    const [created] = await transaction.insert(memoriesTable).values({ ...parsed.data, preview }).returning();
    await transaction.insert(memoryMetadataTable).values({ memoryId: created.id, provenance: "user_provided_fact", createdBy: "Cameron", updatedBy: "Cameron", accessPolicy: "owner_only", version: 1 });
    await transaction.insert(memoryRevisionsTable).values({ memoryId: created.id, version: 1, title: created.title, content: created.content, category: created.category, changedBy: "Cameron", provenance: "user_provided_fact" });
    return created;
  });
  res.status(201).json(GetMemoryResponse.parse(serializeDates(memory)));
});

router.get("/memories/:id", async (req, res): Promise<void> => {
  const params = GetMemoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [memory] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, params.data.id));
  if (!memory) { res.status(404).json({ error: "Memory not found" }); return; }
  res.json(GetMemoryResponse.parse(serializeDates(memory)));
});

router.patch("/memories/:id", async (req, res): Promise<void> => {
  const params = UpdateMemoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateMemoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Partial<typeof parsed.data & { preview: string }> = { ...parsed.data };
  if (parsed.data.content) updateData.preview = parsed.data.content.slice(0, 150);
  const memory = await db.transaction(async (transaction) => {
    const [currentMetadata] = await transaction.select().from(memoryMetadataTable).where(eq(memoryMetadataTable.memoryId, params.data.id));
    const [updated] = await transaction.update(memoriesTable).set(updateData).where(eq(memoriesTable.id, params.data.id)).returning();
    if (!updated) return null;
    const version = (currentMetadata?.version ?? 0) + 1;
    if (!currentMetadata) await transaction.insert(memoryMetadataTable).values({ memoryId: updated.id, provenance: "user_provided_fact", createdBy: "Cameron", updatedBy: "Cameron", accessPolicy: "owner_only", version });
    else await transaction.update(memoryMetadataTable).set({ version, updatedBy: "Cameron", updatedAt: new Date() }).where(eq(memoryMetadataTable.memoryId, updated.id));
    await transaction.insert(memoryRevisionsTable).values({ memoryId: updated.id, version, title: updated.title, content: updated.content, category: updated.category, changedBy: "Cameron", provenance: currentMetadata?.provenance ?? "user_provided_fact" });
    return updated;
  });
  if (!memory) { res.status(404).json({ error: "Memory not found" }); return; }
  res.json(UpdateMemoryResponse.parse(serializeDates(memory)));
});

router.delete("/memories/:id", async (req, res): Promise<void> => {
  const params = DeleteMemoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [memory] = await db.delete(memoriesTable).where(eq(memoriesTable.id, params.data.id)).returning();
  if (!memory) { res.status(404).json({ error: "Memory not found" }); return; }
  res.sendStatus(204);
});

export default router;
