import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, lte, or } from "drizzle-orm";
import {
  db,
  approvalsTable,
  auditEventsTable,
  workRequestsTable,
  workRequestTransitionsTable,
  executionInstructionsTable,
} from "@workspace/db";
import {
  evaluateApproval,
  redactSensitive,
} from "../services/execution-policy.js";
import { transitionWorkRequest } from "../services/execution-runtime.js";
import { evaluateAgentEligibility } from "../services/execution-permissions.js";

const router: IRouter = Router();
const clean = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

router.get("/executions", async (req, res): Promise<void> => {
  const state = clean(req.query.state);
  const query = clean(req.query.query);
  const where =
    state && query
      ? and(
          eq(workRequestsTable.state, state),
          or(
            ilike(workRequestsTable.requestedAction, `%${query}%`),
            ilike(workRequestsTable.project, `%${query}%`),
          ),
        )
      : state
        ? eq(workRequestsTable.state, state)
        : query
          ? or(
              ilike(workRequestsTable.requestedAction, `%${query}%`),
              ilike(workRequestsTable.project, `%${query}%`),
            )
          : undefined;
  const rows = await db
    .select()
    .from(workRequestsTable)
    .where(where)
    .orderBy(desc(workRequestsTable.createdAt))
    .limit(100);
  res.json({ data: rows });
});

router.post(
  "/executions/maintenance/expire-leases",
  async (_req, res): Promise<void> => {
    const expired = await db
      .select()
      .from(workRequestsTable)
      .where(
        and(
          inArray(workRequestsTable.state, ["acknowledged", "running"]),
          lte(workRequestsTable.leaseExpiresAt, new Date()),
        ),
      )
      .limit(100);
    const outcomes: Array<{ id: number; state: string }> = [];
    for (const request of expired) {
      try {
        const failed = await transitionWorkRequest(request, "failed", {
          type: "system",
          reason: "Worker lease expired",
        });
        const retrySafe =
          failed.idempotencyClass === "read_only" &&
          failed.retryCount < failed.maxAttempts - 1;
        if (retrySafe) {
          const [retryable] = await db
            .update(workRequestsTable)
            .set({
              retryCount: failed.retryCount + 1,
              claimedByAgentId: null,
              leaseExpiresAt: null,
              error: "Worker lease expired; safe read-only retry queued",
            })
            .where(
              and(
                eq(workRequestsTable.id, failed.id),
                eq(workRequestsTable.state, "failed"),
              ),
            )
            .returning();
          const queued = await transitionWorkRequest(retryable, "queued", {
            type: "system",
            reason: "Safe read-only retry",
          });
          const approved = await transitionWorkRequest(queued, "approved", {
            type: "policy",
            reason: "Existing approval remains scoped to this execution",
          });
          outcomes.push({ id: approved.id, state: approved.state });
        } else outcomes.push({ id: failed.id, state: failed.state });
      } catch {
        outcomes.push({ id: request.id, state: "concurrent_change" });
      }
    }
    res.json({ processed: outcomes.length, outcomes });
  },
);

router.get("/executions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid execution id" });
    return;
  }
  const [request] = await db
    .select()
    .from(workRequestsTable)
    .where(eq(workRequestsTable.id, id));
  if (!request) {
    res.status(404).json({ error: "Execution not found" });
    return;
  }
  const instructions: Record<string, unknown>[] = Array.isArray(
    req.body?.instructions,
  )
    ? req.body.instructions.filter(
        (item: unknown): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object"),
      )
    : [];
  if (instructions.length)
    await db
      .insert(executionInstructionsTable)
      .values(
        instructions.map((item: Record<string, unknown>) => ({
          requestId: request.id,
          instructionType:
            clean(item.type) === "playbook" ? "playbook" : "skill",
          stableId: clean(item.id) ?? "UNMAPPED",
          name: clean(item.name) ?? "UNMAPPED",
          version: clean(item.version),
          provenance: clean(item.provenance),
          selectionReason:
            clean(item.selectionReason) ?? "Explicitly supplied by request",
        })),
      )
      .onConflictDoNothing();
  const [transitions, approvals, audit] = await Promise.all([
    db
      .select()
      .from(workRequestTransitionsTable)
      .where(eq(workRequestTransitionsTable.requestId, id))
      .orderBy(workRequestTransitionsTable.createdAt),
    db.select().from(approvalsTable).where(eq(approvalsTable.requestId, id)),
    db
      .select()
      .from(auditEventsTable)
      .where(eq(auditEventsTable.requestId, id))
      .orderBy(auditEventsTable.createdAt),
  ]);
  res.json({ request, transitions, approval: approvals[0] ?? null, audit });
});

router.post("/executions", async (req, res): Promise<void> => {
  const requestedAction = clean(req.body?.requestedAction);
  const riskLevel = Number(req.body?.riskLevel ?? 0);
  if (
    !requestedAction ||
    !Number.isInteger(riskLevel) ||
    riskLevel < 0 ||
    riskLevel > 4
  ) {
    res
      .status(400)
      .json({ error: "requestedAction and riskLevel (0-4) are required" });
    return;
  }
  const decision = evaluateApproval({
    riskLevel,
    agentCanAutoApprove: req.body?.agentCanAutoApprove === true,
    standingOwnerAuthority: req.body?.standingOwnerAuthority === true,
    prohibited: req.body?.prohibited === true,
  });
  const executionKey = clean(req.body?.executionKey) ?? randomUUID();
  const agentId = Number.isInteger(req.body?.agentId)
    ? (req.body.agentId as number)
    : null;
  const eligibility = agentId
    ? await evaluateAgentEligibility(agentId, req.body?.requirements)
    : null;
  const [request] = await db
    .insert(workRequestsTable)
    .values({
      executionKey,
      taskId: Number.isInteger(req.body?.taskId) ? req.body.taskId : null,
      agentId,
      requestedAction,
      riskLevel,
      approvalDecision: decision,
      state: "draft",
      business: clean(req.body?.business),
      project: clean(req.body?.project),
      repository: clean(req.body?.repository),
      environment: clean(req.body?.environment),
      routingReason: clean(req.body?.routingReason),
      requirements: redactSensitive(req.body?.requirements ?? {}) as Record<
        string,
        unknown
      >,
    })
    .onConflictDoNothing({ target: workRequestsTable.executionKey })
    .returning();
  if (!request) {
    const [existing] = await db
      .select()
      .from(workRequestsTable)
      .where(eq(workRequestsTable.executionKey, executionKey));
    res.status(200).json({ request: existing, duplicate: true });
    return;
  }
  let current = await transitionWorkRequest(request, "queued", {
    type: "owner",
    id: "Cameron",
    reason: "Execution request accepted",
  });
  if (!agentId)
    current = await transitionWorkRequest(current, "blocked", {
      type: "router",
      reason: "UNASSIGNED: no worker was selected",
    });
  else if (eligibility && !eligibility.eligible)
    current = await transitionWorkRequest(current, "blocked", {
      type: "policy",
      reason: `${eligibility.code}: ${eligibility.missing.join(", ")}`,
    });
  else if (decision === "DENIED")
    current = await transitionWorkRequest(current, "blocked", {
      type: "policy",
      reason: "Policy prohibits autonomous execution",
    });
  else if (decision === "AUTO_EXECUTE")
    current = await transitionWorkRequest(current, "approved", {
      type: "policy",
      reason: "Risk policy permits automatic execution",
    });
  else {
    current = await transitionWorkRequest(current, "awaiting_approval", {
      type: "policy",
      reason: `${decision} required`,
    });
    await db.insert(approvalsTable).values({
      requestId: current.id,
      status: "pending",
      requiredAuthority:
        decision === "OWNER_APPROVAL" ? "owner" : "orchestrator",
      reason:
        clean(req.body?.approvalReason) ??
        `Risk level ${riskLevel} requires approval`,
      proposedAction: requestedAction,
      expectedEffect: clean(req.body?.expectedEffect),
      rollbackPlan: clean(req.body?.rollbackPlan),
    });
  }
  res.status(201).json({ request: current, duplicate: false });
});

router.get("/approvals", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ approval: approvalsTable, request: workRequestsTable })
    .from(approvalsTable)
    .innerJoin(
      workRequestsTable,
      eq(approvalsTable.requestId, workRequestsTable.id),
    )
    .where(eq(approvalsTable.status, "pending"))
    .orderBy(approvalsTable.createdAt);
  res.json({ data: rows });
});

router.post("/approvals/:id/decision", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const decision = clean(req.body?.decision)?.toLowerCase();
  const note = clean(req.body?.note);
  if (
    !Number.isInteger(id) ||
    !["approve", "reject", "request_changes"].includes(decision ?? "")
  ) {
    res
      .status(400)
      .json({ error: "decision must be approve, reject, or request_changes" });
    return;
  }
  const [approval] = await db
    .select()
    .from(approvalsTable)
    .where(
      and(eq(approvalsTable.id, id), eq(approvalsTable.status, "pending")),
    );
  if (!approval) {
    res
      .status(409)
      .json({ error: "Approval is not pending or does not exist" });
    return;
  }
  const [request] = await db
    .select()
    .from(workRequestsTable)
    .where(eq(workRequestsTable.id, approval.requestId));
  if (!request || request.state !== "awaiting_approval") {
    res.status(409).json({ error: "Request is not awaiting this approval" });
    return;
  }
  const status =
    decision === "approve"
      ? "approved"
      : decision === "reject"
        ? "rejected"
        : "changes_requested";
  await db
    .update(approvalsTable)
    .set({
      status,
      decidedBy: "Cameron",
      decisionNote: note,
      decidedAt: new Date(),
    })
    .where(
      and(eq(approvalsTable.id, id), eq(approvalsTable.status, "pending")),
    );
  const updated = await transitionWorkRequest(
    request,
    decision === "approve"
      ? "approved"
      : decision === "reject"
        ? "rejected"
        : "blocked",
    { type: "owner", id: "Cameron", reason: note ?? status },
  );
  res.json({ approvalId: id, status, request: updated });
});

export default router;
