import path from "node:path";
import { unlink, writeFile } from "node:fs/promises";
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
const DEFAULT_OBSIDIAN_VAULT = "/opt/mission-control-vault";

function sourceKind(source?: string | null) {
  if (!source) return "database" as const;
  if (source.startsWith("obsidian:")) return "obsidian" as const;
  if (source.startsWith("repo-docs:") || source.startsWith("agent-os:")) return "protected" as const;
  return "database" as const;
}

function obsidianFilePath(source: string) {
  const vaultRoot = path.resolve(process.env.MISSION_CONTROL_OBSIDIAN_VAULT?.trim() || DEFAULT_OBSIDIAN_VAULT);
  const relative = source.slice("obsidian:".length).replaceAll("/", path.sep);
  const target = path.resolve(vaultRoot, relative);
  if (target !== vaultRoot && !target.startsWith(`${vaultRoot}${path.sep}`)) throw new Error("Invalid Obsidian memory path");
  return target;
}

function renderObsidianMarkdown(title: string, content: string) {
  const withoutHeading = content.replace(/^#\s+.*(?:\r?\n|$)/, "").trimStart();
  return withoutHeading ? `# ${title}\n\n${withoutHeading}` : `# ${title}\n`;
}

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

  const [current] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, params.data.id));
  if (!current) { res.status(404).json({ error: "Memory not found" }); return; }
  const [metadata] = await db.select().from(memoryMetadataTable).where(eq(memoryMetadataTable.memoryId, params.data.id));
  const kind = sourceKind(metadata?.source);
  if (kind === "protected") {
    res.status(409).json({ error: "This memory is synced from a protected Mission Control source document. Edit the source document instead." });
    return;
  }

  const title = parsed.data.title ?? current.title;
  let content = parsed.data.content ?? current.content;
  if (kind === "obsidian" && metadata?.source) {
    content = renderObsidianMarkdown(title, content);
    try { await writeFile(obsidianFilePath(metadata.source), content, "utf8"); }
    catch (error) { console.error("Obsidian memory write failed", error); res.status(500).json({ error: "Unable to update the Obsidian source note" }); return; }
  }

  const updateData = {
    ...parsed.data,
    title,
    content,
    preview: content.replace(/^---[\s\S]*?---\s*/m, "").replace(/^#+\s+/gm, "").replace(/\s+/g, " ").trim().slice(0, 150),
  };

  const memory = await db.transaction(async (transaction) => {
    const [currentMetadata] = await transaction.select().from(memoryMetadataTable).where(eq(memoryMetadataTable.memoryId, params.data.id));
    const [updated] = await transaction.update(memoriesTable).set({ ...updateData, updatedAt: new Date() }).where(eq(memoriesTable.id, params.data.id)).returning();
    if (!updated) return null;
    const version = (currentMetadata?.version ?? 0) + 1;
    if (!currentMetadata) await transaction.insert(memoryMetadataTable).values({ memoryId: updated.id, provenance: "user_provided_fact", createdBy: "Cameron", updatedBy: "Cameron", accessPolicy: "owner_only", version });
    else await transaction.update(memoryMetadataTable).set({ version, updatedBy: "Cameron", lastVerified: kind === "obsidian" ? new Date() : currentMetadata.lastVerified, updatedAt: new Date() }).where(eq(memoryMetadataTable.memoryId, updated.id));
    await transaction.insert(memoryRevisionsTable).values({ memoryId: updated.id, version, title: updated.title, content: updated.content, category: updated.category, changedBy: "Cameron", provenance: currentMetadata?.provenance ?? "user_provided_fact" });
    return updated;
  });
  if (!memory) { res.status(404).json({ error: "Memory not found" }); return; }
  res.json(UpdateMemoryResponse.parse(serializeDates(memory)));
});

router.delete("/memories/:id", async (req, res): Promise<void> => {
  const params = DeleteMemoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [memory] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, params.data.id));
  if (!memory) { res.status(404).json({ error: "Memory not found" }); return; }
  const [metadata] = await db.select().from(memoryMetadataTable).where(eq(memoryMetadataTable.memoryId, params.data.id));
  const kind = sourceKind(metadata?.source);
  if (kind === "protected") {
    res.status(409).json({ error: "This memory is synced from a protected Mission Control source document and cannot be deleted here." });
    return;
  }

  if (kind === "obsidian" && metadata?.source) {
    try { await unlink(obsidianFilePath(metadata.source)); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        console.error("Obsidian memory delete failed", error);
        res.status(500).json({ error: "Unable to delete the Obsidian source note" });
        return;
      }
    }
  }

  const [deleted] = await db.delete(memoriesTable).where(eq(memoriesTable.id, params.data.id)).returning();
  if (!deleted) { res.status(404).json({ error: "Memory not found" }); return; }
  res.sendStatus(204);
});

export default router;
