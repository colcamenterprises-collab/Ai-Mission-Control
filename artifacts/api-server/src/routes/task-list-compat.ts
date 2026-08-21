import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";

const router: IRouter = Router();

// The durable workflow supports states that pre-date the generated public Task
// enum (for example completion_pending and changes_required). The Kanban is an
// owner operating surface and must receive the full canonical task record rather
// than failing the entire list because an older generated response schema cannot
// represent a current workflow state.
router.get("/tasks", async (req, res): Promise<void> => {
  const filters = [];
  if (typeof req.query.status === "string" && req.query.status) filters.push(eq(tasksTable.status, req.query.status));
  if (typeof req.query.assignee === "string" && req.query.assignee) filters.push(eq(tasksTable.assignee, req.query.assignee));
  if (typeof req.query.priority === "string" && req.query.priority) filters.push(eq(tasksTable.priority, req.query.priority));
  if (typeof req.query.project === "string" && req.query.project) filters.push(eq(tasksTable.project, req.query.project));
  const tasks = await db.select().from(tasksTable).where(filters.length ? and(...filters) : undefined).orderBy(tasksTable.createdAt);
  res.json(serializeDates(tasks.filter((task) => task.archivedAt === null)));
});

export default router;
