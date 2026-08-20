import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { tasksTable } from "./tasks";

export const workRequestsTable = pgTable(
  "work_requests",
  {
    id: serial("id").primaryKey(),
    executionKey: text("execution_key").notNull(),
    taskId: integer("task_id").references(() => tasksTable.id, {
      onDelete: "set null",
    }),
    agentId: integer("agent_id").references(() => agentsTable.id, {
      onDelete: "set null",
    }),
    requestedAction: text("requested_action").notNull(),
    state: text("state").notNull().default("draft"),
    riskLevel: integer("risk_level").notNull().default(0),
    approvalDecision: text("approval_decision")
      .notNull()
      .default("AUTO_EXECUTE"),
    routingReason: text("routing_reason"),
    business: text("business"),
    project: text("project"),
    runtime: text("runtime"),
    provider: text("provider"),
    model: text("model"),
    repository: text("repository"),
    environment: text("environment"),
    requirements: jsonb("requirements").notNull().default({}),
    result: jsonb("result"),
    ownerReport: text("owner_report"),
    error: text("error"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cachedTokens: integer("cached_tokens"),
    providerCost: numeric("provider_cost", { precision: 14, scale: 6 }),
    toolCalls: integer("tool_calls"),
    retryCount: integer("retry_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(1),
    idempotencyClass: text("idempotency_class")
      .notNull()
      .default("side_effecting"),
    claimedByAgentId: integer("claimed_by_agent_id").references(
      () => agentsTable.id,
      { onDelete: "set null" },
    ),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastProgressAt: timestamp("last_progress_at", { withTimezone: true }),
    progress: jsonb("progress"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    executionKeyUnique: uniqueIndex("work_requests_execution_key_uidx").on(
      table.executionKey,
    ),
    stateIdx: index("work_requests_state_idx").on(table.state),
    agentStateIdx: index("work_requests_agent_state_idx").on(
      table.agentId,
      table.state,
    ),
    taskIdx: index("work_requests_task_idx").on(table.taskId),
  }),
);

export const workRequestTransitionsTable = pgTable(
  "work_request_transitions",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => workRequestsTable.id, { onDelete: "cascade" }),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    reason: text("reason"),
    context: jsonb("context").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    requestIdx: index("work_request_transitions_request_idx").on(
      table.requestId,
      table.createdAt,
    ),
  }),
);

export const approvalsTable = pgTable(
  "approvals",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => workRequestsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    requiredAuthority: text("required_authority").notNull(),
    reason: text("reason").notNull(),
    expectedEffect: text("expected_effect"),
    rollbackPlan: text("rollback_plan"),
    proposedAction: text("proposed_action").notNull(),
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    oneActiveApproval: uniqueIndex("approvals_request_uidx").on(
      table.requestId,
    ),
    pendingIdx: index("approvals_status_idx").on(table.status, table.createdAt),
  }),
);

export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    requestId: integer("request_id").references(() => workRequestsTable.id, {
      onDelete: "set null",
    }),
    taskId: integer("task_id").references(() => tasksTable.id, {
      onDelete: "set null",
    }),
    agentId: integer("agent_id").references(() => agentsTable.id, {
      onDelete: "set null",
    }),
    outcome: text("outcome").notNull(),
    payload: jsonb("payload").notNull().default({}),
    redacted: boolean("redacted").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventIdx: index("audit_events_type_created_idx").on(
      table.eventType,
      table.createdAt,
    ),
    requestIdx: index("audit_events_request_idx").on(
      table.requestId,
      table.createdAt,
    ),
  }),
);

export const agentExecutionScopesTable = pgTable(
  "agent_execution_scopes",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(),
    scopeValue: text("scope_value").notNull(),
    operation: text("operation").notNull().default("use"),
    grantedBy: text("granted_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueGrant: uniqueIndex("agent_execution_scopes_grant_uidx").on(
      table.agentId,
      table.scopeType,
      table.scopeValue,
      table.operation,
    ),
    lookupIdx: index("agent_execution_scopes_lookup_idx").on(
      table.agentId,
      table.scopeType,
      table.scopeValue,
    ),
  }),
);
export const executionInstructionsTable = pgTable(
  "execution_instructions",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => workRequestsTable.id, { onDelete: "cascade" }),
    instructionType: text("instruction_type").notNull(),
    stableId: text("stable_id").notNull(),
    name: text("name").notNull(),
    version: text("version"),
    provenance: text("provenance"),
    selectionReason: text("selection_reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    usageUnique: uniqueIndex("execution_instructions_uidx").on(
      table.requestId,
      table.instructionType,
      table.stableId,
    ),
  }),
);

export type WorkRequest = typeof workRequestsTable.$inferSelect;
