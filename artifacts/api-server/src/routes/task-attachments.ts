import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tasksTable, taskMessagesTable } from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";
import { storeAttachment } from "../services/upload-storage.js";

const router: IRouter = Router();

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

router.post("/tasks/:id/attachments", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid task id" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const name = cleanString(req.body?.name);
  const dataBase64 = cleanString(req.body?.dataBase64);
  const mimeType = cleanString(req.body?.mimeType) || undefined;
  if (!name || !dataBase64) { res.status(400).json({ error: "Attachment name and data are required" }); return; }

  try {
    const attachment = await storeAttachment({ scope: "tasks", id, name, dataBase64, mimeType, uploadedBy: "Cameron" });
    const attachments = [...(task.attachments ?? []), attachment];
    const [updated] = await db.update(tasksTable).set({ attachments }).where(eq(tasksTable.id, id)).returning();
    await db.insert(taskMessagesTable).values({ taskId: id, author: "Cameron", body: `ATTACHMENT ADDED — ${attachment.name}` });
    res.status(201).json(serializeDates(updated));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to store attachment" });
  }
});

export default router;
