import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  agentsTable,
  approvalsTable,
  db,
  taskMessagesTable,
  tasksTable,
  workRequestsTable,
} from "@workspace/db";
import { CreateTaskBody, GetTaskResponse } from "@workspace/api-zod";
import { serializeDates } from "../utils/serialize.js";
import { intakeActionableTask, IntakeValidationError } from "../services/orchestrator-intake.js";
import { createGovernedWorkRequest } from "../services/governed-work.js";
import { transitionWorkRequest } from "../services/execution-runtime.js";

const router: IRouter = Router();

async function addTaskMessage(taskId: number, author: string, body: string) {
  const [message] = await db.insert(taskMessagesTable).values({ taskId, author, body }).returning();
  await db.update(tasksTable).set({ unreadMessages: author === "Cameron" ? 0 : 1 }).where(eq(tasksTable.id, taskId));
  return message;
}

async function assignedAgent(task: typeof tasksTable.$inferSelect) {
  if (!task.assignee || task.assignee === "Unassigned") return null;
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.name, task.assignee));
  return agent ?? null;
}

async function createTaskFollowUp(task: typeof tasksTable.$inferSelect, action: string, reason: string) {
  const agent = await assignedAgent(task);
  const request = await createGovernedWorkRequest({
    taskId: task.id,
    agentId: agent?.id ?? null,
    requestedAction: action,
    project: task.project,
    routingReason: reason,
    riskLevel: 1,
  });
  await db.update(tasksTable).set({ status: request.state === "blocked" ? "blocked" : "ready", updatedAt: new Date() }).where(eq(tasksTable.id, task.id));
  await addTaskMessage(task.id, "Mission Control", `Governed work request #${request.id} created (${request.state}). No direct runtime dispatch was used.`);
  return request;
}

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const description = parsed.data.description?.trim();
  if (!description) { res.status(400).json({ error: "Task description is required for canonical intake" }); return; }
  try {
    const result = await intakeActionableTask({
      title: parsed.data.title,
      description,
      project: parsed.data.project,
      priority: parsed.data.priority,
      requestedAgent: parsed.data.assignee === "Unassigned" ? undefined : parsed.data.assignee,
      dueDate: parsed.data.dueDate,
      ownerReviewRequired: parsed.data.ownerReviewRequired,
    });
    res.status(201).json(GetTaskResponse.parse(serializeDates(result.task)));
  } catch (error) {
    if (error instanceof IntakeValidationError) { res.status(400).json({ error: error.message }); return; }
    throw error;
  }
});

router.post("/tasks/:id/messages", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!Number.isInteger(id) || !body) { res.status(400).json({ error: "Task and message are required" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const message = await addTaskMessage(id, "Cameron", body);
  const history = await db.select().from(taskMessagesTable).where(eq(taskMessagesTable.taskId, id)).orderBy(asc(taskMessagesTable.createdAt));
  const recentContext = history.slice(-12).map((item) => `${item.author}: ${item.body}`).join("\n");
  await createTaskFollowUp(task, `Owner added a message to task #${id}. Review the task conversation and continue only within the governed request.\n\nOwner message:\n${body}\n\nRecent task conversation:\n${recentContext}`, "Owner task message requires governed continuation");
  res.status(201).json(serializeDates(message));
});

router.post("/tasks/:id/approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid task id" }); return; }
  const note = typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : "Approved to continue.";
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const [row] = await db
    .select({ approval: approvalsTable, request: workRequestsTable })
    .from(approvalsTable)
    .innerJoin(workRequestsTable, eq(approvalsTable.requestId, workRequestsTable.id))
    .where(and(eq(workRequestsTable.taskId, id), eq(approvalsTable.status, "pending"), eq(workRequestsTable.state, "awaiting_approval")))
    .orderBy(desc(approvalsTable.createdAt))
    .limit(1);
  if (!row) { res.status(409).json({ error: "No pending governed approval exists for this task" }); return; }
  const [decided] = await db.update(approvalsTable).set({ status: "approved", decidedBy: "Cameron", decisionNote: note, decidedAt: new Date() }).where(and(eq(approvalsTable.id, row.approval.id), eq(approvalsTable.status, "pending"))).returning();
  if (!decided) { res.status(409).json({ error: "Approval changed concurrently" }); return; }
  const request = await transitionWorkRequest(row.request, "approved", { type: "owner", id: "Cameron", reason: note });
  await db.update(tasksTable).set({ approvalRequired: false, status: "ready", updatedAt: new Date() }).where(eq(tasksTable.id, id));
  await addTaskMessage(id, "Cameron", `APPROVED — ${note}`);
  await addTaskMessage(id, "Mission Control", `Governed approval #${decided.id} approved. Work request #${request.id} is now available for worker claim.`);
  res.json({ approved: true, taskId: id, approvalId: decided.id, requestId: request.id, state: request.state });
});

router.post("/tasks/:id/request-changes", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (!Number.isInteger(id) || !note) { res.status(400).json({ error: "Task id and change request are required" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (task.status !== "review") { res.status(409).json({ error: "Only tasks in owner Review can have changes requested" }); return; }
  await addTaskMessage(id, "Cameron", `OWNER REQUESTED CHANGES — ${note}`);
  const request = await createTaskFollowUp(task, `Owner requested changes on task #${id}: ${note}\nReview the complete task conversation, perform only the requested follow-up, and report progress through the governed execution lifecycle.`, "Owner requested governed rework");
  res.json({ accepted: true, taskId: id, requestId: request.id, state: request.state });
});

export default router;
