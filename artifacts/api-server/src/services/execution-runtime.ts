import { and, eq } from "drizzle-orm";
import {
  db,
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
        : ["completed", "failed", "rejected", "cancelled"].includes(to)
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
