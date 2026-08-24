import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const secretsVaultTable = pgTable("secrets_vault", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("api_key"),
  provider: text("provider"),
  encryptedValue: text("encrypted_value").notNull(),
  valueHint: text("value_hint"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runtimeHostsTable = pgTable("runtime_hosts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  runtimeType: text("runtime_type").notNull(),
  hostType: text("host_type").notNull().default("local"),
  rootDir: text("root_dir").notNull(),
  cliPath: text("cli_path"),
  status: text("status").notNull().default("unknown"),
  capabilities: jsonb("capabilities").notNull().default({}),
  lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeeTemplatesTable = pgTable("employee_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  runtimeType: text("runtime_type").notNull(),
  provider: text("provider"),
  model: text("model"),
  department: text("department"),
  identityTemplate: text("identity_template"),
  soulTemplate: text("soul_template"),
  agentTemplate: text("agent_template"),
  userTemplate: text("user_template"),
  skillNames: jsonb("skill_names").notNull().default([]),
  defaultPermissions: jsonb("default_permissions").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentRuntimeInstancesTable = pgTable("agent_runtime_instances", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  runtimeHostId: integer("runtime_host_id").references(() => runtimeHostsTable.id, { onDelete: "set null" }),
  runtimeType: text("runtime_type").notNull(),
  runtimeAgentId: text("runtime_agent_id"),
  workspacePath: text("workspace_path"),
  model: text("model"),
  status: text("status").notNull().default("pending"),
  health: text("health").notNull().default("unknown"),
  lastError: text("last_error"),
  provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
  lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentSecretGrantsTable = pgTable("agent_secret_grants", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  secretId: integer("secret_id").notNull().references(() => secretsVaultTable.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull().default("runtime"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
