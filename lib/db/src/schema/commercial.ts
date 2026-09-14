import { pgTable, serial, text, boolean, timestamp, jsonb, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  industry: text("industry"),
  country: text("country"),
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  website: text("website"),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembershipsTable = pgTable("organization_memberships", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  principalType: text("principal_type").notNull(),
  principalId: text("principal_id").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ membershipUnique: uniqueIndex("organization_membership_principal_uidx").on(table.organizationId, table.principalType, table.principalId) }));

export const organizationPlansTable = pgTable("organization_plans", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().unique().references(() => organizationsTable.id, { onDelete: "cascade" }),
  planKey: text("plan_key").notNull().default("founder"),
  billingStatus: text("billing_status").notNull().default("not_configured"),
  entitlements: jsonb("entitlements").notNull().default({}),
  aiBudgetUsdMonthly: integer("ai_budget_usd_monthly"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationBrandingTable = pgTable("organization_branding", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().unique().references(() => organizationsTable.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  accentColor: text("accent_color"),
  theme: text("theme").notNull().default("dark"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationOnboardingTable = pgTable("organization_onboarding", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().unique().references(() => organizationsTable.id, { onDelete: "cascade" }),
  businessProfileComplete: boolean("business_profile_complete").notNull().default(false),
  brandingComplete: boolean("branding_complete").notNull().default(false),
  modulesSelected: boolean("modules_selected").notNull().default(false),
  knowledgeImported: boolean("knowledge_imported").notNull().default(false),
  firstAgentCreated: boolean("first_agent_created").notNull().default(false),
  firstWorkflowCertified: boolean("first_workflow_certified").notNull().default(false),
  selectedModules: jsonb("selected_modules").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
