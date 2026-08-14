import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, ideasTable } from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";
import { storeAttachment } from "../services/upload-storage.js";

const router: IRouter = Router();

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

router.get("/ideas", async (_req, res): Promise<void> => {
  const ideas = await db.select().from(ideasTable).orderBy(asc(ideasTable.createdAt));
  res.json(serializeDates(ideas));
});

router.post("/ideas", async (req, res): Promise<void> => {
  const title = cleanString(req.body?.title);
  const notes = typeof req.body?.notes === "string" ? req.body.notes : "";
  if (!title) { res.status(400).json({ error: "Idea title is required" }); return; }
  const [idea] = await db.insert(ideasTable).values({ title, notes, attachments: [] }).returning();
  res.status(201).json(serializeDates(idea));
});

router.patch("/ideas/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid idea id" }); return; }
  const update: { title?: string; notes?: string } = {};
  if (typeof req.body?.title === "string") {
    const title = req.body.title.trim();
    if (!title) { res.status(400).json({ error: "Idea title cannot be empty" }); return; }
    update.title = title;
  }
  if (typeof req.body?.notes === "string") update.notes = req.body.notes;
  const [idea] = await db.update(ideasTable).set(update).where(eq(ideasTable.id, id)).returning();
  if (!idea) { res.status(404).json({ error: "Idea not found" }); return; }
  res.json(serializeDates(idea));
});

router.delete("/ideas/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid idea id" }); return; }
  const [idea] = await db.delete(ideasTable).where(eq(ideasTable.id, id)).returning();
  if (!idea) { res.status(404).json({ error: "Idea not found" }); return; }
  res.sendStatus(204);
});

router.post("/ideas/:id/attachments", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid idea id" }); return; }
  const [idea] = await db.select().from(ideasTable).where(eq(ideasTable.id, id));
  if (!idea) { res.status(404).json({ error: "Idea not found" }); return; }
  const name = cleanString(req.body?.name);
  const dataBase64 = cleanString(req.body?.dataBase64);
  const mimeType = cleanString(req.body?.mimeType) || undefined;
  if (!name || !dataBase64) { res.status(400).json({ error: "Attachment name and data are required" }); return; }
  try {
    const attachment = await storeAttachment({ scope: "ideas", id, name, dataBase64, mimeType, uploadedBy: "Cameron" });
    const attachments = [...(idea.attachments ?? []), attachment];
    const [updated] = await db.update(ideasTable).set({ attachments }).where(eq(ideasTable.id, id)).returning();
    res.status(201).json(serializeDates(updated));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to store attachment" });
  }
});

export default router;
