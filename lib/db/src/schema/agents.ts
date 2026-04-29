import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  department: text("department").notNull(),
  isLead: boolean("is_lead").notNull().default(false),
  status: text("status").notNull().default("idle"),
  currentTask: text("current_task"),
  lastActive: text("last_active").notNull(),
  responsibilities: text("responsibilities"),
  avatarInitials: text("avatar_initials").notNull(),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  successRate: integer("success_rate").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
