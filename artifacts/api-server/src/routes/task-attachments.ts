import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { Router, raw, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, taskMessagesTable, tasksTable } from "@workspace/db";

const router: IRouter = Router();
const ATTACHMENT_ROOT = process.env.MISSION_CONTROL_TASK_ATTACHMENT_DIR ?? "/var/lib/ai-mission-control/task-attachments";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const blockedExtensions = new Set([".exe", ".dll", ".bat", ".cmd", ".com", ".sh", ".ps1", ".js", ".mjs", ".cjs"]);

function sanitizeFileName(value: string): string {
  const decoded = (() => {
    try { return decodeURIComponent(value); } catch { return value; }
  })();
  const base = path.basename(decoded).replace(/[^a-zA-Z0-9._()\- ]/g, "_").trim();
  return base.slice(0, 180) || "attachment";
}

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const types: Record<string, string> = {
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".json": "application/json",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  return types[ext] ?? "application/octet-stream";
}

router.post(
  "/tasks/:id/attachments",
  raw({ type: "application/octet-stream", limit: MAX_FILE_BYTES }),
  async (req, res): Promise<void> => {
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      res.status(400).json({ error: "Invalid task id" });
      return;
    }

    const rawName = typeof req.headers["x-file-name"] === "string" ? req.headers["x-file-name"] : "";
    const fileName = sanitizeFileName(rawName);
    if (!rawName) {
      res.status(400).json({ error: "x-file-name header is required" });
      return;
    }
    if (blockedExtensions.has(path.extname(fileName).toLowerCase())) {
      res.status(415).json({ error: "This file type is not allowed on Mission Control tasks" });
      return;
    }

    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!body.length) {
      res.status(400).json({ error: "Attachment is empty" });
      return;
    }
    if (body.length > MAX_FILE_BYTES) {
      res.status(413).json({ error: "Attachment exceeds the 20 MB limit" });
      return;
    }

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const taskDir = path.join(ATTACHMENT_ROOT, String(taskId));
    await mkdir(taskDir, { recursive: true, mode: 0o700 });
    const storedName = `${crypto.randomUUID()}-${fileName}`;
    const storedPath = path.join(taskDir, storedName);
    await writeFile(storedPath, body, { mode: 0o600 });

    const attachment = {
      name: fileName,
      url: `/api/tasks/${taskId}/attachments/${encodeURIComponent(storedName)}`,
    };
    const attachments = [...(task.attachments ?? []), attachment];
    await db.update(tasksTable).set({ attachments }).where(eq(tasksTable.id, taskId));
    await db.insert(taskMessagesTable).values({
      taskId,
      author: "Cameron Parker",
      body: `ATTACHMENT ADDED — ${fileName}`,
    });

    res.status(201).json({ attachment, count: attachments.length });
  },
);

router.get("/tasks/:id/attachments/:storedName", async (req, res): Promise<void> => {
  const taskId = Number(req.params.id);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }

  const storedName = path.basename(req.params.storedName);
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const expectedUrl = `/api/tasks/${taskId}/attachments/${encodeURIComponent(storedName)}`;
  const attachment = (task.attachments ?? []).find((item) => item.url === expectedUrl);
  if (!attachment) {
    res.status(404).json({ error: "Attachment not found on this task" });
    return;
  }

  try {
    const data = await readFile(path.join(ATTACHMENT_ROOT, String(taskId), storedName));
    res.setHeader("Content-Type", contentTypeFor(attachment.name));
    res.setHeader("Content-Length", String(data.length));
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`);
    res.send(data);
  } catch {
    res.status(404).json({ error: "Attachment file is missing from storage" });
  }
});

router.delete("/tasks/:id/attachments/:storedName", async (req, res): Promise<void> => {
  const taskId = Number(req.params.id);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }

  const storedName = path.basename(req.params.storedName);
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const expectedUrl = `/api/tasks/${taskId}/attachments/${encodeURIComponent(storedName)}`;
  const attachment = (task.attachments ?? []).find((item) => item.url === expectedUrl);
  if (!attachment) {
    res.status(404).json({ error: "Attachment not found on this task" });
    return;
  }

  const attachments = (task.attachments ?? []).filter((item) => item.url !== expectedUrl);
  await db.update(tasksTable).set({ attachments }).where(eq(tasksTable.id, taskId));
  await unlink(path.join(ATTACHMENT_ROOT, String(taskId), storedName)).catch(() => undefined);
  await db.insert(taskMessagesTable).values({
    taskId,
    author: "Cameron Parker",
    body: `ATTACHMENT REMOVED — ${attachment.name}`,
  });

  res.json({ removed: true, count: attachments.length });
});

export default router;
