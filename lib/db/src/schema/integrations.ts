import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  category: text("category").notNull().default("custom"),
  iconInitials: text("icon_initials").notNull(),
  iconColor: text("icon_color").notNull().default("from-slate-600 to-slate-800"),
  status: text("status").notNull().default("connected"),
  apiKey: text("api_key"),
  credentialType: text("credential_type").notNull().default("public"),
  username: text("username"),
  password: text("password"),
  customCredential: text("custom_credential"),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentIntegrationsTable = pgTable("agent_integrations", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  integrationId: integer("integration_id").notNull(),
  role: text("role"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIntegrationSchema = createInsertSchema(integrationsTable).omit({ id: true, createdAt: true });
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type Integration = typeof integrationsTable.$inferSelect;

export const insertAgentIntegrationSchema = createInsertSchema(agentIntegrationsTable).omit({ id: true, assignedAt: true });
export type InsertAgentIntegration = z.infer<typeof insertAgentIntegrationSchema>;
export type AgentIntegration = typeof agentIntegrationsTable.$inferSelect;
