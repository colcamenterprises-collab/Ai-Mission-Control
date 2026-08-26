import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import {
  db,
  agentsTable,
  auditEventsTable,
  workRequestsTable,
  workRequestTransitionsTable,
  type WorkRequest,
} from "@workspace/db";
import {
  assertTransition,
  redactSensitive,
  type WorkRequestState,
} from "./execution-policy.js";

const ACTIVE_WORK_STATES: WorkRequestState[] = ["acknowledged", "running"];
const TERMINAL_WORK_STATES: WorkRequestState[] = [
  "completed",
  "failed",
  "rejected",
  "cancelled",
];

function activeLeaseCondition(now: Date) {
  return or(
    isNull(workRequestsTable.leaseExpiresAt),
    gt(workRequestsTable.leaseExpiresAt, now),
  );
}

export async function reconcileAgentStates(agentIds?: number[]): Promise<void> {
  const now = new Date();
  const agents = agentIds?.length
    ? await db
        .select()
        .from(agentsTable)
        .where(inArray(agentsTable.id, [...new Set(agentIds)]))
    : await db.select().from(agentsTable);

  if (!agents.length) return;

  const activeRequests = await db
    .select()
    .from(workRequestsTable)
    .where(
      and(
        inArray(
          workRequestsTable.agentId,
          agents.map((agent) => agent.id),
        ),
        inArray(workRequestsTable.state, ACTIVE_WORK_STATES),
        activeLeaseCondition(now),
      ),
    )
    .orderBy(workRequestsTable.updatedAt);

  const activeByAgent = new Map<number, WorkRequest>();
  for (const request of activeRequests) {
    if (request.agentId == null) continue;
    const existing = activeByAgent.get(request.agentId);
    if (!existing || request.state === "running") {
      activeByAgent.set(request.agentId, request);
    }
  }

  for (const agent of agents) {
    const active = activeByAgent.get(agent.id);
    const status = active
      ? "active"
      : ["error", "pending"].includes(agent.status)
        ? agent.status
        : "idle";
    const currentTask = active ? active.requestedAction : null;
    if (agent.status === status && agent.currentTask === currentTask) continue;
    await db
      .update(agentsTable)
      .set({ status, currentTask, lastActive: "just now" })
      .where(eq(agentsTable.id, agent.id));
  }
}

export async function transitionWorkRequest(
  request: WorkRequest,
  to: WorkRequestState,
  actor: {
    type: string;
    id?: string;
    reason?: string;
    context?: Record<string, unknown>;
  },
): Promise<WorkRequest> {
  const from = request.state as WorkRequestState;
  assertTransition(from, to);
  const now = new Date();
  const timestamps =
    to === "acknowledged"
      ? { acknowledgedAt: now }
      : to === "running"
        ? { startedAt: now }
        : TERMINAL_WORK_STATES.includes(to)
          ? { finishedAt: now }
          : {};
  const safeContext = redactSensitive(actor.context ?? {}) as Record<
    string,
    unknown
  >;
  return db.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(workRequestsTable)
      .set({ state: to, updatedAt: now, ...timestamps })
      .where(
        and(
          eq(workRequestsTable.id, request.id),
          eq(workRequestsTable.state, from),
        ),
      )
      .returning();
    if (!updated)
      throw new Error(
        "Work request changed concurrently; reload before retrying",
      );

    if (updated.agentId != null) {
      if (ACTIVE_WORK_STATES.includes(to)) {
        await transaction
          .update(agentsTable)
          .set({
            status: "active",
            currentTask: updated.requestedAction,
            lastActive: "just now",
          })
          .where(eq(agentsTable.id, updated.agentId));
      } else if (TERMINAL_WORK_STATES.includes(to)) {
        const [otherActive] = await transaction
          .select()
          .from(workRequestsTable)
          .where(
            and(
              eq(workRequestsTable.agentId, updated.agentId),
              ne(workRequestsTable.id, updated.id),
              inArray(workRequestsTable.state, ACTIVE_WORK_STATES),
              activeLeaseCondition(now),
            ),
          )
          .orderBy(workRequestsTable.updatedAt)
          .limit(1);
        await transaction
          .update(agentsTable)
          .set({
            status: otherActive ? "active" : "idle",
            currentTask: otherActive ? otherActive.requestedAction : null,
            lastActive: "just now",
          })
          .where(eq(agentsTable.id, updated.agentId));
      }
    }

    await transaction.insert(workRequestTransitionsTable).values({
      requestId: request.id,
      fromState: from,
      toState: to,
      actorType: actor.type,
      actorId: actor.id,
      reason: actor.reason,
      context: safeContext,
    });
    await transaction.insert(auditEventsTable).values({
      eventType: `work_request.${to}`,
      actorType: actor.type,
      actorId: actor.id,
      requestId: request.id,
      taskId: request.taskId,
      agentId: request.agentId,
      outcome: "success",
      payload: { from, to, reason: actor.reason, context: safeContext },
      redacted: true,
    });
    return updated;
  });
}
