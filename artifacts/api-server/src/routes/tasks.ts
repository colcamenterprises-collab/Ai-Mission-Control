import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, tasksTable, taskMessagesTable, projectsTable, projectTaskArchivesTable } from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";
import {
  ListTasksResponse,
  CreateTaskBody,
  GetTaskParams,
  GetTaskResponse,
  UpdateTaskParams,
  UpdateTaskBody,
  UpdateTaskResponse,
  DeleteTaskParams,
  MoveTaskParams,
  MoveTaskBody,
  MoveTaskResponse,
  ListTasksQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/projects", async (_req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable).orderBy(asc(projectsTable.name));
  res.json(serializeDates(projects));
});

router.post("/projects", async (req, res): Promise<void> => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) { res.status(400).json({ error: "Project name is required" }); return; }
  const [project] = await db.insert(projectsTable).values({ name, description: typeof req.body?.description === "string" ? req.body.description.trim() : null }).onConflictDoNothing().returning();
  if (!project) { res.status(409).json({ error: "Project already exists" }); return; }
  res.status(201).json(serializeDates(project));
});

router.get("/tasks", async (req, res): Promise<void> => {
  const query = ListTasksQueryParams.safeParse(req.query);
  const filters = [];
  if (query.success) {
    if (query.data.status) filters.push(eq(tasksTable.status, query.data.status));
    if (query.data.assignee) filters.push(eq(tasksTable.assignee, query.data.assignee));
    if (query.data.priority) filters.push(eq(tasksTable.priority, query.data.priority));
    if (query.data.project) filters.push(eq(tasksTable.project, query.data.project));
  }
  const tasks = await db.select().from(tasksTable).where(filters.length ? and(...filters) : undefined).orderBy(tasksTable.createdAt);
  res.json(ListTasksResponse.parse(serializeDates(tasks)));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [task] = await db.insert(tasksTable).values(parsed.data).returning();
  res.status(201).json(GetTaskResponse.parse(serializeDates(task)));
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(GetTaskResponse.parse(serializeDates(task)));
});

router.get("/tasks/:id/details", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid task id" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const messages = await db.select().from(taskMessagesTable).where(eq(taskMessagesTable.taskId, id)).orderBy(asc(taskMessagesTable.createdAt));
  await db.update(tasksTable).set({ unreadMessages: 0 }).where(eq(tasksTable.id, id));
  res.json(serializeDates({ ...task, unreadMessages: 0, messages }));
});

router.post("/tasks/:id/messages", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!Number.isInteger(id) || !body) { res.status(400).json({ error: "Task and message are required" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const [message] = await db.insert(taskMessagesTable).values({ taskId: id, author: "Cameron", body }).returning();
  res.status(201).json(serializeDates(message));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [task] = await db.update(tasksTable).set(parsed.data).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(UpdateTaskResponse.parse(serializeDates(task)));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [task] = await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.sendStatus(204);
});

router.patch("/tasks/:id/move", async (req, res): Promise<void> => {
  const params = MoveTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = MoveTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const completing = parsed.data.status === "done";
  const [task] = await db.update(tasksTable).set({ status: parsed.data.status, archivedAt: completing ? new Date() : null }).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (completing) {
    const messages = await db.select().from(taskMessagesTable).where(eq(taskMessagesTable.taskId, task.id)).orderBy(asc(taskMessagesTable.createdAt));
    await db.insert(projectTaskArchivesTable).values({
      taskId: task.id,
      project: task.project,
      archive: serializeDates({ task, messages, attachments: task.attachments, report: task.report, archivedAt: task.archivedAt }),
    }).onConflictDoUpdate({ target: projectTaskArchivesTable.taskId, set: { project: task.project, archive: serializeDates({ task, messages, attachments: task.attachments, report: task.report, archivedAt: task.archivedAt }) } });
  }
  res.json(MoveTaskResponse.parse(serializeDates(task)));
});

export default router;
