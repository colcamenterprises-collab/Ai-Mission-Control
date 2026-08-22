import { Router, type IRouter } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, inboxItemsTable, memoriesTable, memoryMetadataTable, memoryRevisionsTable } from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";
import { intakeActionableTask, IntakeValidationError } from "../services/orchestrator-intake.js";
import { archiveNoteInObsidian, encodeNoteContent, exposeNote, normalizeNoteKind, syncNotesFromObsidian, writeNoteToObsidian } from "../services/notes-sync.js";

const router: IRouter = Router();
const sources = new Set(["typed", "voice_transcript", "imported", "agent"]);
const states = new Set(["unreviewed", "reviewed", "promoted", "dismissed", "archived"]);
const clean = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const expose = <T extends { content: string }>(item: T) => serializeDates(exposeNote(item));

router.get("/inbox", async (_req, res) => {
  try { await syncNotesFromObsidian(); } catch (error) { console.error("Obsidian note sync failed", error); }
  const items = await db.select().from(inboxItemsTable).where(isNull(inboxItemsTable.archivedAt)).orderBy(asc(inboxItemsTable.createdAt));
  res.json(items.map(expose));
});

router.get("/inbox/unreviewed", async (_req, res) => {
  try { await syncNotesFromObsidian(); } catch (error) { console.error("Obsidian note sync failed", error); }
  const items = await db.select().from(inboxItemsTable).where(and(eq(inboxItemsTable.reviewStatus, "unreviewed"), isNull(inboxItemsTable.archivedAt))).orderBy(asc(inboxItemsTable.createdAt));
  res.json(items.map(expose));
});

router.post("/inbox/review-results", async (req, res): Promise<void> => {
  const reviews = Array.isArray(req.body?.reviews) ? req.body.reviews : [];
  if (!reviews.length) { res.status(400).json({ error: "At least one factual Inbox review is required" }); return; }
  const results = [];
  for (const candidate of reviews) {
    const id = Number(candidate?.id);
    const comment = clean(candidate?.comment);
    if (!Number.isInteger(id) || !comment || comment.length > 800) continue;
    const now = new Date();
    const [item] = await db.update(inboxItemsTable).set({ reviewStatus: "reviewed", reviewedAt: now, orchestratorComment: comment, updatedAt: now }).where(and(eq(inboxItemsTable.id, id), eq(inboxItemsTable.reviewStatus, "unreviewed"), isNull(inboxItemsTable.archivedAt))).returning();
    if (item) { results.push(item); await writeNoteToObsidian(item).catch((error) => console.error("Obsidian note write failed", error)); }
  }
  res.json({ reviewed: results.length, items: results.map(expose) });
});

router.post("/inbox", async (req, res): Promise<void> => {
  const content = clean(req.body?.content);
  const source = clean(req.body?.source) ?? "typed";
  const kind = normalizeNoteKind(req.body?.kind);
  if (!content || !sources.has(source)) { res.status(400).json({ error: "content and a valid source are required" }); return; }
  const [item] = await db.insert(inboxItemsTable).values({ title: clean(req.body?.title), content: encodeNoteContent(kind, content), source, createdBy: clean(req.body?.createdBy) ?? "Owner" }).returning();
  try { await writeNoteToObsidian(item); } catch (error) { console.error("Obsidian note write failed", error); }
  res.status(201).json(expose(item));
});

router.patch("/inbox/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid inbox id" }); return; }
  const [current] = await db.select().from(inboxItemsTable).where(eq(inboxItemsTable.id, id));
  if (!current) { res.status(404).json({ error: "Inbox item not found" }); return; }
  const update: Partial<typeof inboxItemsTable.$inferInsert> = {};
  if ("title" in req.body) update.title = clean(req.body.title);
  if ("content" in req.body || "kind" in req.body) {
    const currentExposed = exposeNote(current);
    const content = "content" in req.body ? clean(req.body.content) : currentExposed.content;
    if (!content) { res.status(400).json({ error: "content cannot be empty" }); return; }
    update.content = encodeNoteContent("kind" in req.body ? normalizeNoteKind(req.body.kind) : currentExposed.kind, content);
  }
  if ("source" in req.body) { const source = clean(req.body.source); if (!source || !sources.has(source)) { res.status(400).json({ error: "Invalid source" }); return; } update.source = source; }
  if ("reviewStatus" in req.body) { const state = clean(req.body.reviewStatus); if (!state || !states.has(state)) { res.status(400).json({ error: "Invalid review state" }); return; } update.reviewStatus = state; update.reviewedAt = state === "reviewed" ? new Date() : undefined; }
  if ("linkedProjectId" in req.body) update.linkedProjectId = req.body.linkedProjectId === null ? null : Number(req.body.linkedProjectId);
  if ("orchestratorComment" in req.body) update.orchestratorComment = clean(req.body.orchestratorComment);
  update.updatedAt = new Date();
  const [item] = await db.update(inboxItemsTable).set(update).where(eq(inboxItemsTable.id, id)).returning();
  try { await writeNoteToObsidian(item); } catch (error) { console.error("Obsidian note write failed", error); }
  res.json(expose(item));
});

router.post("/inbox/:id/archive", async (req, res): Promise<void> => {
  const id = Number(req.params.id); const now = new Date();
  const [item] = await db.update(inboxItemsTable).set({ reviewStatus: "archived", archivedAt: now, updatedAt: now }).where(eq(inboxItemsTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Inbox item not found" }); return; }
  try { await archiveNoteInObsidian(item); } catch (error) { console.error("Obsidian note archive failed", error); }
  res.json(expose(item));
});

router.post("/inbox/:id/promote-memory", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid inbox id" }); return; }
  const [item] = await db.select().from(inboxItemsTable).where(eq(inboxItemsTable.id, id));
  if (!item || item.archivedAt) { res.status(404).json({ error: "Inbox item not found" }); return; }
  const exposed = exposeNote(item);
  const category = exposed.kind === "decision" ? "decisions" : exposed.kind === "research" ? "research" : "knowledge";
  const memory = await db.transaction(async (transaction) => {
    const title = item.title?.trim() || `Note #${item.id}`;
    const preview = exposed.content.slice(0, 150);
    const [created] = await transaction.insert(memoriesTable).values({ title, content: exposed.content, category, preview }).returning();
    await transaction.insert(memoryMetadataTable).values({ memoryId: created.id, provenance: "user_provided_fact", source: `note:${item.id}`, createdBy: "Owner", updatedBy: "Owner", accessPolicy: "owner_only", version: 1 });
    await transaction.insert(memoryRevisionsTable).values({ memoryId: created.id, version: 1, title, content: exposed.content, category, changedBy: "Owner", provenance: "user_provided_fact" });
    await transaction.update(inboxItemsTable).set({ reviewStatus: "promoted", updatedAt: new Date() }).where(eq(inboxItemsTable.id, item.id));
    return created;
  });
  const [updated] = await db.select().from(inboxItemsTable).where(eq(inboxItemsTable.id, id));
  if (updated) await writeNoteToObsidian(updated).catch((error) => console.error("Obsidian note write failed", error));
  res.status(201).json({ memory: serializeDates(memory), note: updated ? expose(updated) : null });
});

router.post("/inbox/:id/convert", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid inbox id" }); return; }
  try {
    const result = await intakeActionableTask({ title: req.body?.title, project: req.body?.project }, { inboxItemId: id });
    res.status(result.created ? 201 : 200).json({ taskId: result.task.id, duplicatePrevented: result.duplicatePrevented, orchestratorReview: result.orchestratorReview, allocation: result.allocation });
  } catch (error) {
    if (error instanceof IntakeValidationError) { res.status(error.message === "Inbox item not found" ? 404 : 400).json({ error: error.message }); return; }
    throw error;
  }
});

export default router;
