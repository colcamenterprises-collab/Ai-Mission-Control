import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import {
  db,
  tasksTable,
  taskMessagesTable,
  projectsTable,
  projectTaskArchivesTable,
  agentsTable,
  agentCommandsTable,
  activityTable,
} from "@workspace/db";
import { serializeDates } from "../utils/serialize.js";
import { dispatchRuntime, isRuntimeConfigured } from "../services/agent-runtime.js";
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

function workflowLane(status: string): "To-Do" | "Doing" | "Done" {
  if (status === "done" || status === "completed" || status === "archived") return "Done";
  if (["running", "in_progress", "review", "blocked"].includes(status)) return "Doing";
  return "To-Do";
}

function humanizeStoredTaskMessage<T extends { body: string }>(message: T): T {
  const match = message.body.match(/^Task moved from ([a-z_]+) to ([a-z_]+)\.$/i);
  if (!match) return message;
  return { ...message, body: `Task moved from ${workflowLane(match[1].toLowerCase())} to ${workflowLane(match[2].toLowerCase())}.` };
}

async function addTaskMessage(taskId: number, author: string, body: string) {
  const [message] = await db.insert(taskMessagesTable).values({ taskId, author, body }).returning();
  await db.update(tasksTable).set({ unreadMessages: author === "Cameron" ? 0 : 1 }).where(eq(tasksTable.id, taskId));
  return message;
}

async function queueTaskFollowUp(task: typeof tasksTable.$inferSelect, instructions: string, reason: string) {
  if (!task.assignee || task.assignee === "Unassigned") return null;
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.name, task.assignee));
  if (!agent) return null;
  const context = JSON.stringify({ source: "task-conversation", taskId: task.id, taskTitle: task.title, project: task.project, reason }, null, 2);
  const [command] = await db.insert(agentCommandsTable).values({ agentId: agent.id, taskId: task.id, instructions, context }).returning();
  await db.update(tasksTable).set({ status: "running" }).where(eq(tasksTable.id, task.id));
  await db.insert(activityTable).values({ agentName: agent.name, action: reason, detail: `Task #${task.id}: ${instructions.slice(0, 220)}`, status: "pending" });

  if (isRuntimeConfigured(agent)) {
    void (async () => {
      try {
        await addTaskMessage(task.id, agent.name, "Update received. I am reviewing the task conversation and continuing the work.");
        const result = await dispatchRuntime(agent, { mode: "work", instructions, context, taskId: task.id, commandId: command.id });
        await db.update(agentCommandsTable).set({ acknowledgedAt: new Date(), deliveredViaHttp: result.ok }).where(eq(agentCommandsTable.id, command.id));
        if (result.delivery === "queued" && result.ok) {
          await db.update(tasksTable).set({ status: "running" }).where(eq(tasksTable.id, task.id));
          await db.insert(activityTable).values({ agentName: agent.name, action: "Detached task follow-up started", detail: result.output ?? `Task #${task.id} queued for detached execution`, status: "active" });
          return;
        }
        if (result.output) await addTaskMessage(task.id, agent.name, result.output);
        await db.update(tasksTable).set({ status: result.ok ? "review" : "blocked" }).where(eq(tasksTable.id, task.id));
        await db.insert(activityTable).values({ agentName: agent.name, action: result.ok ? "Task follow-up response recorded" : "Task follow-up failed", detail: result.output ?? result.error, status: result.ok ? "active" : "error" });
        if (!result.ok) await addTaskMessage(task.id, "Mission Control", `BLOCKED — ${result.error ?? "agent runtime failed"}`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown task follow-up error";
        await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, task.id));
        await addTaskMessage(task.id, "Mission Control", `BLOCKED — ${detail}`);
      }
    })();
  }
  return command;
}

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
  res.json(ListTasksResponse.parse(serializeDates(tasks.filter(task => task.archivedAt === null))));
});

router.get("/tasks/archived", async (_req, res): Promise<void> => {
  const tasks = await db.select().from(tasksTable).orderBy(tasksTable.updatedAt);
  res.json(serializeDates(tasks.filter(task => task.archivedAt !== null)));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [task] = await db.insert(tasksTable).values(parsed.data).returning();
  await addTaskMessage(task.id, "Mission Control", "Task created. Awaiting orchestrator review.");
  res.status(201).json(GetTaskResponse.parse(serializeDates(task)));
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(GetTaskResponse.parse(serializeDates(task)));
});

router.get("/tasks/:id/details", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid task id" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const storedMessages = await db.select().from(taskMessagesTable).where(eq(taskMessagesTable.taskId, id)).orderBy(asc(taskMessagesTable.createdAt));
  const messages = storedMessages.map(humanizeStoredTaskMessage);
  await db.update(tasksTable).set({ unreadMessages: 0 }).where(eq(tasksTable.id, id));
  res.json(serializeDates({ ...task, unreadMessages: 0, messages }));
});

router.post("/tasks/:id/messages", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!Number.isInteger(id) || !body) { res.status(400).json({ error: "Task and message are required" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const message = await addTaskMessage(id, "Cameron", body);
  const history = await db.select().from(taskMessagesTable).where(eq(taskMessagesTable.taskId, id)).orderBy(asc(taskMessagesTable.createdAt));
  const recentContext = history.slice(-12).map(item => `${item.author}: ${item.body}`).join("\n");
  const command = await queueTaskFollowUp(task, `Owner added a new message to task #${id}. Review the task and conversation, respond inside the task, and continue the work if possible.\n\nOwner message:\n${body}\n\nRecent task conversation:\n${recentContext}`, "Owner message queued to assigned worker");
  if (command) await addTaskMessage(id, "Mission Control", `Owner message sent to ${task.assignee}.`);
  res.status(201).json(serializeDates(message));
});

router.post("/tasks/:id/approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid task id" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const note = typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : "Approved to continue.";
  const timestamp = new Date();
  await db.update(tasksTable).set({ approvalRequired: false, status: "running" }).where(eq(tasksTable.id, id));
  await addTaskMessage(id, "Cameron", `APPROVED — ${note}`);
  const command = await queueTaskFollowUp(task, `Owner approval granted for task #${id} at ${timestamp.toISOString()}. ${note}\nContinue the approved work and report all actions back to this task.`, "Owner approval queued to assigned worker");
  if (command) await addTaskMessage(id, "Mission Control", `Approval sent to ${task.assignee}; work may continue.`);
  res.json({ approved: true, taskId: id, approvedAt: timestamp.toISOString(), queued: Boolean(command) });
});

router.post("/tasks/:id/request-changes", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (!Number.isInteger(id) || !note) { res.status(400).json({ error: "Task id and change request are required" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  await db.update(tasksTable).set({ approvalRequired: false, status: "running" }).where(eq(tasksTable.id, id));
  await addTaskMessage(id, "Cameron", `CHANGES REQUESTED — ${note}`);
  const command = await queueTaskFollowUp(task, `Owner requested changes on task #${id}: ${note}\nReview the complete task conversation, make the requested follow-up changes, and report progress inside the task.`, "Change request queued to assigned worker");
  if (command) await addTaskMessage(id, "Mission Control", `Change request sent to ${task.assignee}.`);
  res.json({ accepted: true, taskId: id, queued: Boolean(command) });
});

router.post("/tasks/:id/archive", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid task id" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (task.status !== "done") { res.status(409).json({ error: "Only completed tasks can be archived" }); return; }
  const archivedAt = new Date();
  await db.update(tasksTable).set({ archivedAt }).where(eq(tasksTable.id, id));
  await addTaskMessage(id, "Mission Control", `Task archived after final sign-off at ${archivedAt.toISOString()}.`);
  const messages = await db.select().from(taskMessagesTable).where(eq(taskMessagesTable.taskId, id)).orderBy(asc(taskMessagesTable.createdAt));
  const [updatedTask] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  await db.insert(projectTaskArchivesTable).values({ taskId: id, project: task.project, archive: serializeDates({ task: updatedTask, messages, attachments: task.attachments, report: task.report, archivedAt }) }).onConflictDoUpdate({ target: projectTaskArchivesTable.taskId, set: { project: task.project, archive: serializeDates({ task: updatedTask, messages, attachments: task.attachments, report: task.report, archivedAt }) } });
  res.json({ archived: true, taskId: id, archivedAt: archivedAt.toISOString() });
});

router.post("/tasks/:id/restore", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid task id" }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  await db.update(tasksTable).set({ archivedAt: null, status: "ready" }).where(eq(tasksTable.id, id));
  await addTaskMessage(id, "Mission Control", "Archived task restored to To-Do.");
  res.json({ restored: true, taskId: id, status: "ready" });
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [task] = await db.update(tasksTable).set(parsed.data).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(UpdateTaskResponse.parse(serializeDates(task)));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [task] = await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.sendStatus(204);
});

router.patch("/tasks/:id/move", async (req, res): Promise<void> => {
  const params = MoveTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = MoveTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  const [task] = await db.update(tasksTable).set({ status: parsed.data.status, archivedAt: null }).where(eq(tasksTable.id, params.data.id)).returning();
  const fromLane = workflowLane(existing.status);
  const toLane = workflowLane(task.status);
  if (fromLane !== toLane) await addTaskMessage(task.id, "Mission Control", `Task moved from ${fromLane} to ${toLane}.`);
  res.json(MoveTaskResponse.parse(serializeDates(task)));
});

export default router;
