import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const agentSessionsTable = pgTable("agent_sessions", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  taskId: integer("task_id"),
  status: text("status").notNull().default("working"),
  context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown> | null>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type AgentSession = typeof agentSessionsTable.$inferSelect;
