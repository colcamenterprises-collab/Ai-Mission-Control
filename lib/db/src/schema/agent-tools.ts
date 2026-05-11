import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentToolsTable = pgTable("agent_tools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  url: text("url"),
  category: text("category").notNull().default("custom"),
  // credential type determines which credential fields are used
  credentialType: text("credential_type").notNull().default("api_key"),
  // API key / bearer token
  apiKey: text("api_key"),
  // Basic auth
  username: text("username"),
  password: text("password"),
  // Extra notes the agent should know (e.g. rate limits, quirks)
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentToolAccessTable = pgTable("agent_tool_access", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  toolId: integer("tool_id").notNull().references(() => agentToolsTable.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AgentTool = typeof agentToolsTable.$inferSelect;
export type AgentToolAccess = typeof agentToolAccessTable.$inferSelect;
