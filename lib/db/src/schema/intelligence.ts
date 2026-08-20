import {
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
import { memoriesTable } from "./memories";
import { tasksTable } from "./tasks";
import { agentsTable } from "./agents";
export const memoryMetadataTable = pgTable(
  "memory_metadata",
  {
    id: serial("id").primaryKey(),
    memoryId: integer("memory_id")
      .notNull()
      .references(() => memoriesTable.id, { onDelete: "cascade" }),
    tier: text("tier").notNull().default("WARM"),
    provenance: text("provenance").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    status: text("status").notNull().default("active"),
    business: text("business"),
    project: text("project"),
    source: text("source"),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    lastVerified: timestamp("last_verified", { withTimezone: true }),
    supersedesMemoryId: integer("supersedes_memory_id"),
    accessPolicy: text("access_policy").notNull().default("owner_only"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    onePerMemory: uniqueIndex("memory_metadata_memory_uidx").on(table.memoryId),
    scopeIdx: index("memory_metadata_scope_idx").on(
      table.business,
      table.project,
      table.status,
    ),
  }),
);
export const memoryRevisionsTable = pgTable(
  "memory_revisions",
  {
    id: serial("id").primaryKey(),
    memoryId: integer("memory_id")
      .notNull()
      .references(() => memoriesTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull(),
    changedBy: text("changed_by").notNull(),
    provenance: text("provenance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    versionUnique: uniqueIndex("memory_revisions_version_uidx").on(
      table.memoryId,
      table.version,
    ),
  }),
);
export const memoryAgentGrantsTable = pgTable(
  "memory_agent_grants",
  {
    id: serial("id").primaryKey(),
    memoryId: integer("memory_id")
      .notNull()
      .references(() => memoriesTable.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    access: text("access").notNull().default("read"),
    grantedBy: text("granted_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    grantUnique: uniqueIndex("memory_agent_grants_uidx").on(
      table.memoryId,
      table.agentId,
      table.access,
    ),
  }),
);
export const signalsTable = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    business: text("business"),
    project: text("project"),
    category: text("category").notNull(),
    title: text("title").notNull(),
    evidence: jsonb("evidence").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    severity: text("severity"),
    urgency: text("urgency"),
    actionability: text("actionability"),
    owner: text("owner"),
    linkedTaskId: integer("linked_task_id").references(() => tasksTable.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("new"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusIdx: index("signals_status_idx").on(table.status, table.detectedAt),
  }),
);
export const accountSourcesTable = pgTable(
  "account_sources",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("not_connected"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerUnique: uniqueIndex("account_sources_provider_uidx").on(
      table.provider,
    ),
  }),
);
export const accountHealthTable = pgTable(
  "account_health",
  {
    id: serial("id").primaryKey(),
    accountKey: text("account_key").notNull(),
    name: text("name").notNull(),
    business: text("business"),
    services: jsonb("services").notNull().default([]),
    accountOwner: text("account_owner"),
    renewalDate: timestamp("renewal_date", { withTimezone: true }),
    lastMeaningfulContact: timestamp("last_meaningful_contact", {
      withTimezone: true,
    }),
    outstandingRequest: text("outstanding_request"),
    responseCadence: text("response_cadence"),
    needsReply: text("needs_reply"),
    positiveSignals: jsonb("positive_signals").notNull().default([]),
    negativeSignals: jsonb("negative_signals").notNull().default([]),
    risk: text("risk"),
    recommendedAction: text("recommended_action"),
    evidence: jsonb("evidence").notNull().default([]),
    sourceStatus: text("source_status").notNull().default("NO_DATA"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accountUnique: uniqueIndex("account_health_key_uidx").on(table.accountKey),
  }),
);
