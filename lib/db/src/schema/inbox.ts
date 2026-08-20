import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

/** Lightweight capture only. Inbox items never participate in task execution. */
export const inboxItemsTable = pgTable("inbox_items", {
  id: serial("id").primaryKey(),
  title: text("title"),
  content: text("content").notNull(),
  source: text("source").notNull().default("typed"),
  createdBy: text("created_by").notNull(),
  reviewStatus: text("review_status").notNull().default("unreviewed"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  orchestratorComment: text("orchestrator_comment"),
  linkedTaskId: integer("linked_task_id").unique(),
  linkedProjectId: integer("linked_project_id"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type InboxItem = typeof inboxItemsTable.$inferSelect;
