import { db, activityTable } from "@workspace/db";

export async function auditLog(input: {
  action: string;
  entityType: string;
  entityId: string | number;
  actorType: "admin" | "agent";
  actorName?: string;
  metadata?: string;
}) {
  await db.insert(activityTable).values({
    agentName: input.actorType === "admin" ? (input.actorName ?? "admin") : (input.actorName ?? "agent"),
    action: `${input.action} ${input.entityType}`,
    detail: `entityId=${input.entityId}${input.metadata ? `; ${input.metadata}` : ""}`,
    status: "active",
  });
}
