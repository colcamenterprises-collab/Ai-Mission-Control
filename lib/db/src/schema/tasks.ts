import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  assignee: text("assignee").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("backlog"),
  project: text("project").notNull(),
  dueDate: text("due_date"),
  recurrence: text("recurrence").notNull().default("one_off"),
  approvalRequired: boolean("approval_required").notNull().default(false),
  unreadMessages: integer("unread_messages").notNull().default(0),
  attachments: jsonb("attachments").$type<Array<{ name: string; url?: string }>>().notNull().default([]),
  report: text("report"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const taskMessagesTable = pgTable("task_messages", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  author: text("author").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectTaskArchivesTable = pgTable("project_task_archives", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().unique(),
  project: text("project").notNull(),
  archive: jsonb("archive").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
