import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentCommandsTable = pgTable("agent_commands", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  instructions: text("instructions").notNull(),
  context: text("context"),
  taskId: integer("task_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  deliveredViaHttp: boolean("delivered_via_http").notNull().default(false),
});

export type AgentCommand = typeof agentCommandsTable.$inferSelect;
