import { and, eq, inArray, lte } from "drizzle-orm";
import { auditEventsTable, db, workRequestsTable } from "@workspace/db";
import { transitionWorkRequest } from "./execution-runtime.js";

export type LeaseExpiryOutcome = {
  id: number;
  state: string;
  retried: boolean;
};

export async function expireExecutionLeases(
  now = new Date(),
): Promise<LeaseExpiryOutcome[]> {
  const expired = await db
    .select()
    .from(workRequestsTable)
    .where(
      and(
        inArray(workRequestsTable.state, [
          "dispatched",
          "acknowledged",
          "running",
        ]),
        lte(workRequestsTable.leaseExpiresAt, now),
      ),
    )
    .limit(100);
  const outcomes: LeaseExpiryOutcome[] = [];
  for (const request of expired) {
    try {
      const failed = await transitionWorkRequest(request, "failed", {
        type: "system",
        reason: "Worker lease expired",
        context: { previousState: request.state },
      });
      const retrySafe =
        failed.idempotencyClass === "read_only" &&
        failed.retryCount < failed.maxAttempts - 1;
      const [released] = await db
        .update(workRequestsTable)
        .set({
          retryCount: retrySafe ? failed.retryCount + 1 : failed.retryCount,
          claimedByAgentId: null,
          leaseExpiresAt: null,
          error: retrySafe
            ? "Worker lease expired; safe read-only retry queued"
            : "Worker lease expired; automatic retry prohibited",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workRequestsTable.id, failed.id),
            eq(workRequestsTable.state, "failed"),
          ),
        )
        .returning();
      if (!released) throw new Error("Lease expiry changed concurrently");
      await db.insert(auditEventsTable).values({
        eventType: "execution.lease_expired",
        actorType: "system",
        requestId: released.id,
        taskId: released.taskId,
        agentId: released.agentId,
        outcome: retrySafe ? "retry_queued" : "failed_closed",
        payload: {
          previousState: request.state,
          idempotencyClass: released.idempotencyClass,
          retrySafe,
        },
        redacted: true,
      });
      if (retrySafe) {
        const queued = await transitionWorkRequest(released, "queued", {
          type: "system",
          reason: "Safe read-only lease recovery retry",
        });
        const approved = await transitionWorkRequest(queued, "approved", {
          type: "policy",
          reason: "Existing approval remains scoped to safe read-only retry",
        });
        outcomes.push({
          id: approved.id,
          state: approved.state,
          retried: true,
        });
      } else
        outcomes.push({
          id: released.id,
          state: released.state,
          retried: false,
        });
    } catch {
      outcomes.push({
        id: request.id,
        state: "concurrent_change",
        retried: false,
      });
    }
  }
  return outcomes;
}
