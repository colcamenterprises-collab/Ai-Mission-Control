import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, organizationsTable, organizationBrandingTable, organizationOnboardingTable, organizationPlansTable } from "@workspace/db";
import { requireResolvedTenant } from "../lib/tenant-context.js";

const router: IRouter = Router();
const orgSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), industry: z.string().trim().max(120).nullable().optional(), country: z.string().trim().max(120).nullable().optional(), timezone: z.string().trim().min(1).max(80).optional(), website: z.string().trim().url().nullable().optional(), contactEmail: z.string().trim().email().nullable().optional() });
const brandingSchema = z.object({ displayName: z.string().trim().max(120).nullable().optional(), logoUrl: z.string().trim().url().nullable().optional(), primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), secondaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), theme: z.enum(["dark","light","system"]).optional() });
const onboardingSchema = z.object({ businessProfileComplete: z.boolean().optional(), brandingComplete: z.boolean().optional(), modulesSelected: z.boolean().optional(), knowledgeImported: z.boolean().optional(), firstAgentCreated: z.boolean().optional(), firstWorkflowCertified: z.boolean().optional(), selectedModules: z.array(z.string().trim().min(1).max(80)).max(30).optional() });

async function snapshot(organizationId: number) {
  const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, organizationId));
  const [branding] = await db.select().from(organizationBrandingTable).where(eq(organizationBrandingTable.organizationId, organizationId));
  const [onboarding] = await db.select().from(organizationOnboardingTable).where(eq(organizationOnboardingTable.organizationId, organizationId));
  const [plan] = await db.select().from(organizationPlansTable).where(eq(organizationPlansTable.organizationId, organizationId));
  return { product: { name: "Mission Control", version: "3.0", edition: "Commercial Platform Foundation" }, organization, branding, onboarding, plan };
}

router.get("/v3/product", async (req, res) => { const tenant = requireResolvedTenant(req); res.json(await snapshot(tenant.organizationId)); });
router.get("/v3/organization", async (req, res) => { const tenant = requireResolvedTenant(req); res.json(await snapshot(tenant.organizationId)); });
router.patch("/v3/organization", async (req, res) => { const tenant = requireResolvedTenant(req); const parsed = orgSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "Invalid organization profile", issues: parsed.error.issues }); return; } await db.update(organizationsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(organizationsTable.id, tenant.organizationId)); res.json(await snapshot(tenant.organizationId)); });
router.patch("/v3/branding", async (req, res) => { const tenant = requireResolvedTenant(req); const parsed = brandingSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "Invalid branding", issues: parsed.error.issues }); return; } await db.update(organizationBrandingTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(organizationBrandingTable.organizationId, tenant.organizationId)); res.json(await snapshot(tenant.organizationId)); });
router.patch("/v3/onboarding", async (req, res) => { const tenant = requireResolvedTenant(req); const parsed = onboardingSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "Invalid onboarding state", issues: parsed.error.issues }); return; } await db.update(organizationOnboardingTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(organizationOnboardingTable.organizationId, tenant.organizationId)); res.json(await snapshot(tenant.organizationId)); });
router.get("/v3/readiness", async (req, res) => {
  const tenant = requireResolvedTenant(req); const data = await snapshot(tenant.organizationId);
  const legacy = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM tasks LIMIT 1) AS tasks, EXISTS (SELECT 1 FROM agents LIMIT 1) AS agents, EXISTS (SELECT 1 FROM memories LIMIT 1) AS memories`);
  const legacyPresent = Object.values((legacy.rows?.[0] ?? {}) as Record<string, unknown>).some(Boolean);
  const gates = [
    { key: "tenant_context", label: "Authenticated tenant context", status: "pass", detail: `Resolved ${tenant.slug}` },
    { key: "commercial_tables", label: "Commercial tenant-owned tables", status: "pass", detail: "Organization, membership, plan, branding and onboarding records are tenant-owned." },
    { key: "legacy_domain_isolation", label: "Legacy operational data tenant isolation", status: legacyPresent ? "incomplete" : "pass", detail: legacyPresent ? "Tasks, agents, memories and other existing domains still require organization ownership migration before multi-customer release." : "No legacy rows detected." },
    { key: "billing", label: "Subscription billing", status: "incomplete", detail: "Plan and entitlement boundary exists; billing provider is not connected." },
    { key: "webhook_raw_hmac", label: "Raw-body webhook HMAC", status: "incomplete", detail: "Security release gate remains open until raw request bytes are verified." },
    { key: "hostile_two_tenant", label: "Hostile two-tenant certification", status: "incomplete", detail: "Must pass after every canonical data domain is tenant-owned." },
    { key: "backup_restore", label: "Tenant-aware backup and restore certification", status: "incomplete", detail: "Recovery procedure must be tested before commercial GA." },
  ];
  res.json({ product: data.product, organization: data.organization, releaseReady: gates.every(g => g.status === "pass"), gates });
});

export default router;
