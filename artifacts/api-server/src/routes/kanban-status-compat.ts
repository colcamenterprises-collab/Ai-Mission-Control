import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, taskMessagesTable, tasksTable } from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";

/**
 * Temporary compatibility route for the first-class `changes_required` Kanban
 * state. The persisted task model already accepts free-form workflow states, but
 * the generated OpenAPI/Zod MoveTaskBody enum on current main predates this lane.
 *
 * Mount this router before the generated tasks router. Once the API contract is
 * regenerated with `changes_required`, this shim can be removed.
 */
const router: IRouter = Router();

router.patch("/tasks/:id/move", async (req, res, next): Promise<void> => {
  if (req.body?.status !== "changes_required") {
    next();
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }

  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (existing.status === "done") {
    res.status(409).json({ error: "Completed work cannot be moved to Changes Required" });
    return;
  }

  const [task] = await db
    .update(tasksTable)
    .set({ status: "changes_required", archivedAt: null, updatedAt: new Date() })
    .where(eq(tasksTable.id, id))
    .returning();

  if (existing.status !== "changes_required") {
    await db.insert(taskMessagesTable).values({
      taskId: id,
      author: "Mission Control",
      body: "Task moved to Changes Required.",
    });
  }

  res.json(serializeDates(task));
});

export default router;
