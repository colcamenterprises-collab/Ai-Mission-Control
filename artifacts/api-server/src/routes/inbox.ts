import { Router, type IRouter } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, inboxItemsTable } from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";
import { intakeActionableTask, IntakeValidationError } from "../services/orchestrator-intake.js";

const router: IRouter = Router();
const sources = new Set(["typed", "voice_transcript", "imported", "agent"]);
const states = new Set(["unreviewed", "reviewed", "promoted", "dismissed", "archived"]);
const clean = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

router.get("/inbox", async (_req, res) => {
  const items = await db.select().from(inboxItemsTable)
    .where(isNull(inboxItemsTable.archivedAt)).orderBy(asc(inboxItemsTable.createdAt));
  res.json(serializeDates(items));
});

router.get("/inbox/unreviewed", async (_req, res) => {
  const items = await db.select().from(inboxItemsTable)
    .where(and(eq(inboxItemsTable.reviewStatus, "unreviewed"), isNull(inboxItemsTable.archivedAt)))
    .orderBy(asc(inboxItemsTable.createdAt));
  res.json(serializeDates(items));
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
    const [item] = await db.update(inboxItemsTable).set({ reviewStatus: "reviewed", reviewedAt: now, orchestratorComment: comment, updatedAt: now })
      .where(and(eq(inboxItemsTable.id, id), eq(inboxItemsTable.reviewStatus, "unreviewed"), isNull(inboxItemsTable.archivedAt))).returning();
    if (item) results.push(item);
  }
  res.json({ reviewed: results.length, items: serializeDates(results) });
});

router.post("/inbox", async (req, res): Promise<void> => {
  const content = clean(req.body?.content);
  const source = clean(req.body?.source) ?? "typed";
  if (!content || !sources.has(source)) { res.status(400).json({ error: "content and a valid source are required" }); return; }
  const [item] = await db.insert(inboxItemsTable).values({
    title: clean(req.body?.title), content, source, createdBy: clean(req.body?.createdBy) ?? "Owner",
  }).returning();
  res.status(201).json(serializeDates(item));
});

router.patch("/inbox/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid inbox id" }); return; }
  const update: Partial<typeof inboxItemsTable.$inferInsert> = {};
  if ("title" in req.body) update.title = clean(req.body.title);
  if ("content" in req.body) { const content = clean(req.body.content); if (!content) { res.status(400).json({ error: "content cannot be empty" }); return; } update.content = content; }
  if ("source" in req.body) { const source = clean(req.body.source); if (!source || !sources.has(source)) { res.status(400).json({ error: "Invalid source" }); return; } update.source = source; }
  if ("reviewStatus" in req.body) { const state = clean(req.body.reviewStatus); if (!state || !states.has(state)) { res.status(400).json({ error: "Invalid review state" }); return; } update.reviewStatus = state; update.reviewedAt = state === "reviewed" ? new Date() : undefined; }
  if ("linkedProjectId" in req.body) update.linkedProjectId = req.body.linkedProjectId === null ? null : Number(req.body.linkedProjectId);
  if ("orchestratorComment" in req.body) update.orchestratorComment = clean(req.body.orchestratorComment);
  update.updatedAt = new Date();
  const [item] = await db.update(inboxItemsTable).set(update).where(eq(inboxItemsTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Inbox item not found" }); return; }
  res.json(serializeDates(item));
});

router.post("/inbox/:id/archive", async (req, res): Promise<void> => {
  const id = Number(req.params.id); const now = new Date();
  const [item] = await db.update(inboxItemsTable).set({ reviewStatus: "archived", archivedAt: now, updatedAt: now }).where(eq(inboxItemsTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Inbox item not found" }); return; }
  res.json(serializeDates(item));
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
