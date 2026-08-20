import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import {
  db,
  agentsTable,
  activityTable,
  tasksTable,
  memoriesTable,
  agentCommandsTable,
  agentToolAccessTable,
  agentToolsTable,
  workRequestsTable,
  auditEventsTable,
  memoryAgentGrantsTable,
  memoryMetadataTable,
  memoryRevisionsTable,
} from "@workspace/db";
import { getAgentFromBearer } from "../lib/auth.js";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";
import { generateAgentToken, hashToken } from "../lib/security.js";
import {
  AgentPingBody,
  AgentReportBody,
  DispatchAgentBody,
  DispatchAgentParams,
  RegenerateAgentTokenParams,
  AckAgentCommandParams,
} from "@workspace/api-zod";
import {
  formatSkillsForPrompt,
  listSkills,
  readSkill,
  readSkillsForDelegation,
} from "../services/skills.js";
import { getAssignedSkillNamesForAgent } from "../config-operational-agents.js";
import {
  dispatchRuntime,
  isRuntimeConfigured,
} from "../services/agent-runtime.js";
import { transitionWorkRequest } from "../services/execution-runtime.js";
import { evaluateAgentEligibility } from "../services/execution-permissions.js";
import { buildOwnerReport } from "../services/owner-report.js";
import { redactSensitive } from "../services/execution-policy.js";

const router: IRouter = Router();
const CORE_PLAYBOOK_CATEGORIES = ["Product", "Standard", "Spec"];
const LEASE_MS = 120_000;

async function ownedRequest(id: number, agentId: number) {
  const [request] = await db
    .select()
    .from(workRequestsTable)
    .where(
      and(
        eq(workRequestsTable.id, id),
        eq(workRequestsTable.agentId, agentId),
        eq(workRequestsTable.claimedByAgentId, agentId),
      ),
    );
  return request ?? null;
}

router.post(
  "/agent/work-requests/claim",
  createRateLimit("agent-work-claim", 30, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }
    const candidates = await db
      .select()
      .from(workRequestsTable)
      .where(
        and(
          eq(workRequestsTable.agentId, agent.id),
          eq(workRequestsTable.state, "approved"),
          or(
            isNull(workRequestsTable.leaseExpiresAt),
            lt(workRequestsTable.leaseExpiresAt, new Date()),
          ),
        ),
      )
      .orderBy(asc(workRequestsTable.createdAt))
      .limit(10);
    for (const candidate of candidates) {
      const eligibility = await evaluateAgentEligibility(
        agent.id,
        candidate.requirements,
      );
      if (!eligibility.eligible) {
        await db
          .update(workRequestsTable)
          .set({
            state: "blocked",
            error: eligibility.code,
            routingReason: `${eligibility.code}: ${eligibility.missing.join(", ")}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workRequestsTable.id, candidate.id),
              eq(workRequestsTable.state, "approved"),
            ),
          );
        await db.insert(auditEventsTable).values({
          eventType: "permission.denied",
          actorType: "agent",
          actorId: String(agent.id),
          requestId: candidate.id,
          taskId: candidate.taskId,
          agentId: agent.id,
          outcome: "denied",
          payload: { missing: eligibility.missing },
          redacted: true,
        });
        continue;
      }
      let dispatched;
      try {
        dispatched = await transitionWorkRequest(candidate, "dispatched", {
          type: "system",
          reason: "Eligible worker requested work",
        });
      } catch {
        continue;
      }
      const leaseExpiresAt = new Date(Date.now() + LEASE_MS);
      const [claimed] = await db
        .update(workRequestsTable)
        .set({ claimedByAgentId: agent.id, leaseExpiresAt })
        .where(
          and(
            eq(workRequestsTable.id, dispatched.id),
            eq(workRequestsTable.state, "dispatched"),
            isNull(workRequestsTable.claimedByAgentId),
          ),
        )
        .returning();
      if (!claimed) continue;
      const acknowledged = await transitionWorkRequest(
        claimed,
        "acknowledged",
        {
          type: "agent",
          id: String(agent.id),
          reason: "Worker claimed execution",
        },
      );
      res.json({
        request: { ...acknowledged, leaseExpiresAt },
        leaseDurationMs: LEASE_MS,
      });
      return;
    }
    res.status(204).send();
  },
);

router.post(
  "/agent/work-requests/:id/heartbeat",
  createRateLimit("agent-work-heartbeat", 120, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    const id = Number(req.params.id);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }
    const request = await ownedRequest(id, agent.id);
    if (!request || !["acknowledged", "running"].includes(request.state)) {
      res.status(403).json({
        error: "Worker does not own an active lease for this request",
      });
      return;
    }
    const leaseExpiresAt = new Date(Date.now() + LEASE_MS);
    await db
      .update(workRequestsTable)
      .set({ leaseExpiresAt, lastProgressAt: new Date() })
      .where(
        and(
          eq(workRequestsTable.id, id),
          eq(workRequestsTable.claimedByAgentId, agent.id),
        ),
      );
    res.json({ acknowledged: true, leaseExpiresAt });
  },
);

router.post(
  "/agent/work-requests/:id/progress",
  createRateLimit("agent-work-progress", 120, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    const id = Number(req.params.id);
    const message = optionalString(req.body?.message);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }
    let request = await ownedRequest(id, agent.id);
    if (
      !request ||
      !["acknowledged", "running"].includes(request.state) ||
      (request.leaseExpiresAt && request.leaseExpiresAt < new Date())
    ) {
      res.status(403).json({
        error: "Worker does not own an active lease for this request",
      });
      return;
    }
    if (request.state === "acknowledged")
      request = await transitionWorkRequest(request, "running", {
        type: "agent",
        id: String(agent.id),
        reason: "Worker started execution",
      });
    const progress = redactSensitive({
      message,
      percent: Number.isFinite(req.body?.percent)
        ? Math.max(0, Math.min(100, Number(req.body.percent)))
        : null,
      metadata: req.body?.metadata ?? null,
    });
    await db
      .update(workRequestsTable)
      .set({
        progress,
        lastProgressAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      })
      .where(
        and(
          eq(workRequestsTable.id, id),
          eq(workRequestsTable.claimedByAgentId, agent.id),
        ),
      );
    await db.insert(auditEventsTable).values({
      eventType: "execution.progress",
      actorType: "agent",
      actorId: String(agent.id),
      requestId: id,
      taskId: request.taskId,
      agentId: agent.id,
      outcome: "success",
      payload: progress as Record<string, unknown>,
      redacted: true,
    });
    res.json({ accepted: true, state: "running" });
  },
);

router.post(
  "/agent/work-requests/:id/complete",
  createRateLimit("agent-work-complete", 30, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    const id = Number(req.params.id);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }
    let request = await ownedRequest(id, agent.id);
    if (
      !request ||
      !["acknowledged", "running"].includes(request.state) ||
      (request.leaseExpiresAt && request.leaseExpiresAt < new Date())
    ) {
      res.status(403).json({
        error: "Worker does not own an active lease for this request",
      });
      return;
    }
    if (request.state === "acknowledged")
      request = await transitionWorkRequest(request, "running", {
        type: "agent",
        id: String(agent.id),
        reason: "Worker completed without intermediate progress",
      });
    const result = redactSensitive(req.body?.result ?? {});
    const ownerReport = buildOwnerReport(request, req.body?.summary ?? result, {
      worker: agent.name,
      ...(req.body?.report && typeof req.body.report === "object"
        ? req.body.report
        : {}),
    });
    const [stored] = await db
      .update(workRequestsTable)
      .set({
        result,
        ownerReport,
        inputTokens: Number.isInteger(req.body?.usage?.inputTokens)
          ? req.body.usage.inputTokens
          : null,
        outputTokens: Number.isInteger(req.body?.usage?.outputTokens)
          ? req.body.usage.outputTokens
          : null,
        cachedTokens: Number.isInteger(req.body?.usage?.cachedTokens)
          ? req.body.usage.cachedTokens
          : null,
        providerCost:
          typeof req.body?.usage?.providerCost === "number"
            ? String(req.body.usage.providerCost)
            : null,
        toolCalls: Number.isInteger(req.body?.usage?.toolCalls)
          ? req.body.usage.toolCalls
          : null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(workRequestsTable.id, id),
          eq(workRequestsTable.claimedByAgentId, agent.id),
        ),
      )
      .returning();
    const completed = await transitionWorkRequest(stored, "completed", {
      type: "agent",
      id: String(agent.id),
      reason: "Worker reported completion",
    });
    if (completed.taskId)
      await db
        .update(tasksTable)
        .set({ status: "completion_pending", report: ownerReport, updatedAt: new Date() })
        .where(
          and(
            eq(tasksTable.id, completed.taskId),
            eq(tasksTable.assignee, agent.name),
          ),
        );
    res.json({ accepted: true, state: completed.state, ownerReport });
  },
);

router.post(
  "/agent/work-requests/:id/fail",
  createRateLimit("agent-work-fail", 30, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    const id = Number(req.params.id);
    const error = optionalString(req.body?.error) ?? "Worker reported failure";
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }
    const request = await ownedRequest(id, agent.id);
    if (
      !request ||
      !["dispatched", "acknowledged", "running"].includes(request.state)
    ) {
      res.status(403).json({ error: "Worker does not own this request" });
      return;
    }
    const [stored] = await db
      .update(workRequestsTable)
      .set({
        error: String(redactSensitive(error)),
        result: redactSensitive(req.body?.detail ?? {}),
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(workRequestsTable.id, id),
          eq(workRequestsTable.claimedByAgentId, agent.id),
        ),
      )
      .returning();
    const failed = await transitionWorkRequest(stored, "failed", {
      type: "agent",
      id: String(agent.id),
      reason: "Worker reported failure",
    });
    if (failed.taskId)
      await db
        .update(tasksTable)
        .set({ status: "blocked", updatedAt: new Date() })
        .where(
          and(
            eq(tasksTable.id, failed.taskId),
            eq(tasksTable.assignee, agent.name),
          ),
        );
    res.json({ accepted: true, state: failed.state });
  },
);

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isJamesHermes(agent: typeof agentsTable.$inferSelect): boolean {
  return (
    agent.provider === "hermes" ||
    agent.name.toLowerCase().includes("james hermes")
  );
}

async function agentSkillsContext(
  agentName: string,
  context?: string | null,
): Promise<string | null> {
  const assignedSkillNames = getAssignedSkillNamesForAgent(agentName);
  const assignedSkills = await readSkillsForDelegation({
    names: assignedSkillNames,
    categories: CORE_PLAYBOOK_CATEGORIES,
  });
  const skillsContext = formatSkillsForPrompt(assignedSkills);
  const attachedNames = assignedSkills
    .map((skill) => `${skill.category}: ${skill.name}`)
    .join("; ");
  return (
    [
      context ?? null,
      attachedNames ? `Attached playbooks: ${attachedNames}` : null,
      skillsContext
        ? `Relevant assigned skills and operating playbooks:\n\n${skillsContext}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n") || null
  );
}

async function loadAgentById(id: number) {
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, id));
  return agent ?? null;
}

router.get(
  "/agent/skills",
  createRateLimit("agent-skills", 60, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }

    const name = typeof req.query.name === "string" ? req.query.name : null;
    const category =
      typeof req.query.category === "string" ? req.query.category : null;
    const result = await listSkills({ name, category });
    res.json({ agentId: agent.id, ...result });
  },
);

router.get(
  "/agent/skills/:id",
  createRateLimit("agent-skills", 60, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }

    const skill = await readSkill(String(req.params.id));
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    res.json({ agentId: agent.id, skill });
  },
);

router.get(
  "/agent/memories",
  createRateLimit("agent-memories", 30, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }
    const rows = await db
      .select({
        memory: memoriesTable,
        metadata: memoryMetadataTable,
        access: memoryAgentGrantsTable.access,
      })
      .from(memoryAgentGrantsTable)
      .innerJoin(
        memoriesTable,
        eq(memoryAgentGrantsTable.memoryId, memoriesTable.id),
      )
      .leftJoin(
        memoryMetadataTable,
        eq(memoryMetadataTable.memoryId, memoriesTable.id),
      )
      .where(
        and(
          eq(memoryAgentGrantsTable.agentId, agent.id),
          inArray(memoryAgentGrantsTable.access, ["read", "write"]),
        ),
      );
    await db.insert(auditEventsTable).values({
      eventType: "memory.read",
      actorType: "agent",
      actorId: String(agent.id),
      agentId: agent.id,
      outcome: "success",
      payload: { memoryIds: rows.map((row) => row.memory.id) },
      redacted: true,
    });
    res.json({ data: rows });
  },
);

router.post(
  "/agent/ping",
  createRateLimit("agent-ping", 60, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }

    const parsed = AgentPingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    await db
      .update(agentsTable)
      .set({ lastPing: new Date(), status: "active" })
      .where(eq(agentsTable.id, agent.id));

    const pendingTasks = await db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        priority: tasksTable.priority,
        status: tasksTable.status,
      })
      .from(tasksTable)
      .where(eq(tasksTable.assignee, agent.name));

    const rawCommands = await db
      .select()
      .from(agentCommandsTable)
      .where(eq(agentCommandsTable.agentId, agent.id));
    const unacked = rawCommands
      .filter((c) => c.acknowledgedAt === null)
      .map((c) => ({
        id: c.id,
        instructions: c.instructions,
        context: c.context ?? null,
        taskId: c.taskId ?? null,
        createdAt: c.createdAt.toISOString(),
      }));

    res.json({
      agentId: agent.id,
      name: agent.name,
      acknowledged: true,
      pendingTasks,
      pendingCommands: unacked,
    });
  },
);

router.post(
  "/agent/command/:id/ack",
  createRateLimit("agent-ack", 60, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }

    const params = AckAgentCommandParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [cmd] = await db
      .update(agentCommandsTable)
      .set({ acknowledgedAt: new Date() })
      .where(
        and(
          eq(agentCommandsTable.id, params.data.id),
          eq(agentCommandsTable.agentId, agent.id),
        ),
      )
      .returning();
    if (!cmd) {
      res.status(404).json({ error: "Command not found" });
      return;
    }

    res.json({ acknowledged: true, commandId: cmd.id });
  },
);

router.post(
  "/agent/report",
  createRateLimit("agent-report", 60, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }

    const parsed = AgentReportBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { type, content, taskId, taskStatus, memoryTitle, memoryCategory } =
      parsed.data;
    const actionLabel =
      type === "task_complete"
        ? "Completed task"
        : type === "memory"
          ? "Stored memory"
          : content.slice(0, 80);

    if (type === "task_complete" && taskId) {
      const [task] = await db
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.id, taskId));
      if (!task || task.assignee !== agent.name) {
        res
          .status(403)
          .json({ error: "This worker is not assigned to that work item." });
        return;
      }
      const requestedStatus = taskStatus === "blocked" ? "blocked" : "completion_pending";
      await db
        .update(tasksTable)
        .set({ status: requestedStatus })
        .where(eq(tasksTable.id, taskId));
    }

    const memoryScope = memoryCategory ?? "knowledge";
    if (type === "memory" && memoryTitle) {
      const permission = await evaluateAgentEligibility(agent.id, {
        memoryScopes: [memoryScope],
      });
      if (!permission.eligible) {
        res.status(403).json({
          error: "Agent lacks explicit write access to this memory scope",
          missing: permission.missing,
        });
        return;
      }
    }
    const [activity] = await db
      .insert(activityTable)
      .values({
        agentName: agent.name,
        action: actionLabel,
        detail: content,
        status: "active",
      })
      .returning();

    if (type === "memory" && memoryTitle) {
      const category = memoryScope;
      const [memory] = await db
        .insert(memoriesTable)
        .values({
          title: memoryTitle,
          content,
          category,
          preview: content.slice(0, 150),
        })
        .returning();
      await db.insert(memoryMetadataTable).values({
        memoryId: memory.id,
        provenance: "worker_inference",
        source: `agent:${agent.id}`,
        createdBy: agent.name,
        updatedBy: agent.name,
        accessPolicy: "explicit_grants",
        version: 1,
      });
      await db.insert(memoryRevisionsTable).values({
        memoryId: memory.id,
        version: 1,
        title: memory.title,
        content: memory.content,
        category: memory.category,
        changedBy: agent.name,
        provenance: "worker_inference",
      });
      await db.insert(memoryAgentGrantsTable).values({
        memoryId: memory.id,
        agentId: agent.id,
        access: "write",
        grantedBy: "Mission Control policy",
      });
      await db.insert(auditEventsTable).values({
        eventType: "memory.write",
        actorType: "agent",
        actorId: String(agent.id),
        agentId: agent.id,
        outcome: "success",
        payload: { memoryId: memory.id, provenance: "worker_inference" },
        redacted: true,
      });
    }

    const agentUpdate: Partial<typeof agentsTable.$inferInsert> = {
      lastPing: new Date(),
    };
    if (type === "task_complete") {
      agentUpdate.tasksCompleted = agent.tasksCompleted + 1;
      agentUpdate.currentTask = null;
      agentUpdate.status = isJamesHermes(agent) ? "active" : "idle";
      agentUpdate.lastActive = "reported completed work";
    } else {
      agentUpdate.currentTask = content.slice(0, 100);
      agentUpdate.status = "active";
      agentUpdate.lastActive = "just now";
    }

    await db
      .update(agentsTable)
      .set(agentUpdate)
      .where(eq(agentsTable.id, agent.id));
    res.json({ accepted: true, activityId: activity.id });
  },
);

router.post(
  "/agents/:id/test",
  createRateLimit("admin-agent-test", 20, 60_000),
  async (req, res): Promise<void> => {
    const params = DispatchAgentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const agent = await loadAgentById(params.data.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    if (!isRuntimeConfigured(agent)) {
      res.status(400).json({
        ok: false,
        error:
          "Agent runtime is not configured. Add a provider API key or webhook endpoint first.",
      });
      return;
    }

    const contextWithSkills = await agentSkillsContext(
      agent.name,
      "This is a Mission Control runtime health test.",
    );
    const result = await dispatchRuntime(agent, {
      mode: "test",
      instructions: `Connection test for ${agent.name}. Reply in one short sentence confirming the connection works and list the playbook categories you received.`,
      context: contextWithSkills,
    });

    const [activity] = await db
      .insert(activityTable)
      .values({
        agentName: agent.name,
        action: result.ok
          ? "Agent connection test passed"
          : "Agent connection test failed",
        detail: result.output ?? result.error,
        status: result.ok ? "active" : "error",
      })
      .returning();

    await db
      .update(agentsTable)
      .set({
        status: result.ok ? "active" : "error",
        lastActive: result.ok
          ? "connection tested with playbooks"
          : "connection test failed",
        lastPing: result.ok ? new Date() : agent.lastPing,
      })
      .where(eq(agentsTable.id, agent.id));

    res
      .status(result.ok ? 200 : 502)
      .json({ ...result, activityId: activity.id });
  },
);

router.post(
  "/agents/:id/test-task",
  createRateLimit("admin-agent-test-task", 10, 60_000),
  async (req, res): Promise<void> => {
    const params = DispatchAgentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const agent = await loadAgentById(params.data.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    if (!isRuntimeConfigured(agent)) {
      res.status(400).json({
        ok: false,
        error:
          "Agent runtime is not configured. Add a provider API key or webhook endpoint first.",
      });
      return;
    }

    const title =
      optionalString(req.body?.title) ?? `Test work for ${agent.name}`;
    const instructions =
      optionalString(req.body?.instructions) ??
      "Write a short Mission Control test report confirming you received and completed this work item.";
    const project = optionalString(req.body?.project) ?? "Mission Control";
    const priority = optionalString(req.body?.priority) ?? "medium";

    const [task] = await db
      .insert(tasksTable)
      .values({
        title,
        description: instructions,
        assignee: agent.name,
        priority,
        status: "running",
        project,
        dueDate: null,
      })
      .returning();
    const contextWithSkills = await agentSkillsContext(
      agent.name,
      "This is an immediate test task executed by the Mission Control runtime. Report which playbooks you used.",
    );
    const [command] = await db
      .insert(agentCommandsTable)
      .values({
        agentId: agent.id,
        taskId: task.id,
        instructions,
        context: contextWithSkills,
      })
      .returning();

    const result = await dispatchRuntime(agent, {
      mode: "work",
      instructions,
      context: contextWithSkills,
      taskId: task.id,
      commandId: command.id,
    });

    await db
      .update(agentCommandsTable)
      .set({
        acknowledgedAt: new Date(),
        deliveredViaHttp: result.ok || result.delivery === "webhook",
      })
      .where(eq(agentCommandsTable.id, command.id));
    await db
      .update(tasksTable)
      .set({ status: result.ok ? "review" : "blocked" })
      .where(eq(tasksTable.id, task.id));
    await db
      .update(agentsTable)
      .set({
        status: result.ok
          ? isJamesHermes(agent)
            ? "active"
            : "idle"
          : "error",
        currentTask: result.ok ? null : `Task #${task.id}: ${title}`,
        lastActive: result.ok
          ? "work response awaiting review"
          : "test task failed",
        lastPing: result.ok ? new Date() : agent.lastPing,
      })
      .where(eq(agentsTable.id, agent.id));

    const [activity] = await db
      .insert(activityTable)
      .values({
        agentName: agent.name,
        action: result.ok
          ? "Test work response received — awaiting review"
          : "Test work failed",
        detail: result.output ?? result.error,
        status: result.ok ? "active" : "error",
      })
      .returning();

    res.status(result.ok ? 201 : 502).json({
      ok: result.ok,
      taskId: task.id,
      commandId: command.id,
      activityId: activity.id,
      result,
    });
  },
);

router.post(
  "/agents/:id/dispatch",
  createRateLimit("admin-dispatch", 20, 60_000),
  async (req, res): Promise<void> => {
    const params = DispatchAgentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const agent = await loadAgentById(params.data.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const parsed = DispatchAgentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { instructions, taskId, context } = parsed.data;
    const contextWithSkills = await agentSkillsContext(agent.name, context);
    const [command] = await db
      .insert(agentCommandsTable)
      .values({
        agentId: agent.id,
        instructions,
        context: contextWithSkills,
        taskId: taskId ?? null,
      })
      .returning();

    let dispatched = false;
    let delivery: "provider" | "webhook" | "queued" = "queued";
    let statusCode: number | null = null;
    let httpError: string | null = null;
    let output: string | null = null;

    if (isRuntimeConfigured(agent)) {
      const result = await dispatchRuntime(agent, {
        instructions,
        context: contextWithSkills,
        taskId: taskId ?? null,
        commandId: command.id,
        mode: "work",
      });
      dispatched = result.ok;
      delivery = result.ok ? result.delivery : "queued";
      statusCode = result.statusCode;
      httpError = result.error;
      output = result.output;
      if (dispatched) {
        await db
          .update(agentCommandsTable)
          .set({ acknowledgedAt: new Date(), deliveredViaHttp: true })
          .where(eq(agentCommandsTable.id, command.id));
        if (taskId)
          await db
            .update(tasksTable)
            .set({ status: "completion_pending" })
            .where(eq(tasksTable.id, taskId));
        await db
          .update(agentsTable)
          .set({
            status: isJamesHermes(agent) ? "active" : "idle",
            currentTask: null,
            lastActive: "dispatch response awaiting review",
            lastPing: new Date(),
          })
          .where(eq(agentsTable.id, agent.id));
      }
    }

    await db.insert(activityTable).values({
      agentName: agent.name,
      action: dispatched
        ? "Worker response received — awaiting review"
        : "Command queued — waiting for worker",
      detail:
        output ??
        `${instructions.slice(0, 200)}${httpError ? ` — ${httpError}` : ""}`,
      status: dispatched ? "active" : "pending",
    });

    res.json({
      queued: true,
      commandId: command.id,
      dispatched,
      delivery,
      agentId: agent.id,
      endpoint: agent.endpoint ?? null,
      statusCode,
      error: httpError,
      output,
    });
  },
);

router.post(
  "/agents/:id/token",
  createRateLimit("admin-token", 10, 60_000),
  async (req, res): Promise<void> => {
    const params = RegenerateAgentTokenParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const token = generateAgentToken();
    const tokenHash = hashToken(token);
    const [agent] = await db
      .update(agentsTable)
      .set({ inboundToken: tokenHash })
      .where(eq(agentsTable.id, params.data.id))
      .returning();
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await auditLog({
      action: "regenerated",
      entityType: "agent_token",
      entityId: agent.id,
      actorType: "admin",
    });
    res.json({ agentId: agent.id, inboundToken: token });
  },
);

router.get(
  "/agent/tools",
  createRateLimit("agent-tools", 20, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }

    const rows = await db
      .select({ tool: agentToolsTable })
      .from(agentToolAccessTable)
      .innerJoin(
        agentToolsTable,
        eq(agentToolAccessTable.toolId, agentToolsTable.id),
      )
      .where(eq(agentToolAccessTable.agentId, agent.id));

    // Worker tokens may discover their granted tools, but must never receive
    // reusable API keys or passwords. Provider calls remain server-side until a
    // narrowly scoped tool-proxy contract is introduced.
    const tools = rows
      .filter((r) => r.tool.isActive)
      .map((r) => ({
        id: r.tool.id,
        name: r.tool.name,
        description: r.tool.description,
        url: r.tool.url,
        category: r.tool.category,
        credentialType: r.tool.credentialType,
        notes: r.tool.notes,
        isActive: r.tool.isActive,
        credentialAvailable: Boolean(
          r.tool.apiKey || r.tool.username || r.tool.password,
        ),
      }));

    await auditLog({
      action: "requested",
      entityType: "agent_tool_credentials",
      entityId: agent.id,
      actorType: "agent",
      actorName: agent.name,
    });
    res.json(tools);
  },
);

export default router;
