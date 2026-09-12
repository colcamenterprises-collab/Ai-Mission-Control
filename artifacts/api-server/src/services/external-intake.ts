import crypto from "node:crypto";
import { asc, eq, ilike, or } from "drizzle-orm";
import {
  agentsTable,
  approvalsTable,
  auditEventsTable,
  db,
  taskMessagesTable,
  tasksTable,
  workRequestsTable,
  type WorkRequest,
} from "@workspace/db";
import {
  assessExternalAction,
  type DelegationAssessment,
} from "./execution-policy.js";
import { transitionWorkRequest } from "./execution-runtime.js";
import {
  buildExecutionHarnessContract,
  withExecutionHarnessRequirements,
} from "./agentic-harness.js";

export type ExternalChannel = "whatsapp";
export type ExternalIntakeSource = {
  channel: ExternalChannel;
  externalId: string;
  senderId: string | null;
  conversationId: string;
};

export type ExternalIntakeResult = {
  created: boolean;
  duplicatePrevented: boolean;
  task: typeof tasksTable.$inferSelect;
  request: WorkRequest;
  assessment: DelegationAssessment;
  assignedAgentName: string;
};

function executionKeyFor(source: ExternalIntakeSource): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${source.channel}\n${source.conversationId}\n${source.externalId}`)
    .digest("hex")
    .slice(0, 32);
  return `external:${source.channel}:${digest}`;
}

function cleanTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= 120 ? oneLine : `${oneLine.slice(0, 117)}...`;
}

async function routeExternalAgent(text: string) {
  const finance =
    /\b(finance|financial|reconcil|expense|bank|cash|invoice|payment|sales|receipt)\b/i.test(
      text,
    ) || /^\s*(amanda\b|@amanda\b)/i.test(text);
  const rows = await db
    .select()
    .from(agentsTable)
    .where(
      finance
        ? or(
            ilike(agentsTable.name, "%amanda%"),
            ilike(agentsTable.role, "%financial controller%"),
          )
        : or(
            ilike(agentsTable.name, "%james%"),
            ilike(agentsTable.role, "%orchestr%"),
          ),
    )
    .orderBy(asc(agentsTable.id))
    .limit(1);
  return rows[0] ?? null;
}

function uniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505",
  );
}

async function loadExisting(
  executionKey: string,
): Promise<ExternalIntakeResult | null> {
  const [request] = await db
    .select()
    .from(workRequestsTable)
    .where(eq(workRequestsTable.executionKey, executionKey))
    .limit(1);
  if (!request?.taskId) return null;
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, request.taskId))
    .limit(1);
  if (!task)
    throw new Error(
      `External Work Request #${request.id} references missing Task #${request.taskId}`,
    );
  const requirements =
    request.requirements &&
    typeof request.requirements === "object" &&
    !Array.isArray(request.requirements)
      ? (request.requirements as Record<string, unknown>)
      : {};
  const policy =
    requirements.delegationPolicy &&
    typeof requirements.delegationPolicy === "object" &&
    !Array.isArray(requirements.delegationPolicy)
      ? (requirements.delegationPolicy as Record<string, unknown>)
      : {};
  const assessment: DelegationAssessment = {
    riskLevel: request.riskLevel as DelegationAssessment["riskLevel"],
    actionClass:
      (policy.actionClass as DelegationAssessment["actionClass"]) ??
      (request.riskLevel >= 3
        ? "protected"
        : request.riskLevel >= 2
          ? "controlled"
          : "routine"),
    approvalDecision:
      request.approvalDecision as DelegationAssessment["approvalDecision"],
    reason:
      typeof policy.reason === "string"
        ? policy.reason
        : (request.routingReason ?? "Existing external intake policy"),
    signals: Array.isArray(policy.signals)
      ? policy.signals.filter((v): v is string => typeof v === "string")
      : [],
  };
  return {
    created: false,
    duplicatePrevented: true,
    task,
    request,
    assessment,
    assignedAgentName: task.assignee,
  };
}

export async function intakeExternalTask(params: {
  source: ExternalIntakeSource;
  text: string;
  project?: string;
}): Promise<ExternalIntakeResult> {
  const text = params.text.trim();
  if (!text) throw new Error("External intake text is required");
  if (!params.source.externalId.trim())
    throw new Error("External intake requires a durable external message id");

  const executionKey = executionKeyFor(params.source);
  const existing = await loadExisting(executionKey);
  if (existing) return existing;

  const assessment = assessExternalAction(text);
  const agent = await routeExternalAgent(text);
  if (!agent)
    throw new Error(
      "No eligible Mission Control agent found for external intake",
    );
  const approvalRequired = assessment.approvalDecision === "OWNER_APPROVAL";
  const harness = buildExecutionHarnessContract({
    title: cleanTitle(text),
    description: text,
    approvalRequired,
  });
  const requirements = withExecutionHarnessRequirements(
    {
      source: "external-intake",
      externalSource: {
        channel: params.source.channel,
        externalId: params.source.externalId,
        senderId: params.source.senderId,
        conversationId: params.source.conversationId,
      },
      delegationPolicy: {
        riskLevel: assessment.riskLevel,
        actionClass: assessment.actionClass,
        approvalDecision: assessment.approvalDecision,
        reason: assessment.reason,
        signals: assessment.signals,
      },
    },
    harness,
  );

  let created: { task: typeof tasksTable.$inferSelect; request: WorkRequest };
  try {
    created = await db.transaction(async (tx) => {
      const [task] = await tx
        .insert(tasksTable)
        .values({
          title: cleanTitle(text),
          description: text,
          assignee: agent.name,
          priority: assessment.riskLevel >= 3 ? "high" : "medium",
          status: "ready",
          project: params.project ?? "Mission Control",
          approvalRequired,
          ownerReviewRequired: false,
        })
        .returning();
      await tx.insert(taskMessagesTable).values({
        taskId: task.id,
        author: `External:${params.source.channel}`,
        body: text,
      });
      const [request] = await tx
        .insert(workRequestsTable)
        .values({
          executionKey,
          taskId: task.id,
          agentId: agent.id,
          requestedAction: task.title,
          state: "draft",
          riskLevel: assessment.riskLevel,
          approvalDecision: assessment.approvalDecision,
          routingReason: assessment.reason,
          project: task.project,
          requirements,
          maxAttempts: assessment.riskLevel >= 3 ? 1 : 3,
          idempotencyClass: "side_effecting",
        })
        .returning();
      await tx.insert(auditEventsTable).values({
        eventType: "external_intake.received",
        actorType: params.source.channel,
        actorId: params.source.senderId ?? undefined,
        requestId: request.id,
        taskId: task.id,
        agentId: agent.id,
        outcome: "success",
        payload: {
          channel: params.source.channel,
          externalId: params.source.externalId,
          conversationId: params.source.conversationId,
          riskLevel: assessment.riskLevel,
          actionClass: assessment.actionClass,
          approvalDecision: assessment.approvalDecision,
          assignedAgent: agent.name,
        },
        redacted: true,
      });
      return { task, request };
    });
  } catch (error) {
    if (uniqueViolation(error)) {
      const duplicate = await loadExisting(executionKey);
      if (duplicate) return duplicate;
    }
    throw error;
  }

  let request = await transitionWorkRequest(created.request, "queued", {
    type: "external_intake",
    id: params.source.channel,
    reason:
      "Authenticated external request entered the canonical Mission Control control plane",
    context: {
      externalId: params.source.externalId,
      assignedAgent: agent.name,
      riskLevel: assessment.riskLevel,
    },
  });

  if (assessment.approvalDecision === "AUTO_EXECUTE") {
    request = await transitionWorkRequest(request, "approved", {
      type: "policy",
      id: "delegation-policy",
      reason: assessment.reason,
    });
  } else {
    request = await transitionWorkRequest(request, "awaiting_approval", {
      type: "policy",
      id: "delegation-policy",
      reason: assessment.reason,
    });
    await db
      .insert(approvalsTable)
      .values({
        requestId: request.id,
        status: "pending",
        requiredAuthority:
          assessment.approvalDecision === "OWNER_APPROVAL"
            ? "owner"
            : "orchestrator",
        reason: assessment.reason,
        proposedAction: created.task.title,
      })
      .onConflictDoNothing({ target: approvalsTable.requestId });
  }

  return {
    created: true,
    duplicatePrevented: false,
    task: created.task,
    request,
    assessment,
    assignedAgentName: agent.name,
  };
}
