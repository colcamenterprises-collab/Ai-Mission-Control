import type { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db, organizationsTable, organizationMembershipsTable } from "@workspace/db";
import { ownerSessionFromRequest } from "../services/admin-session.js";
import { canPrincipalAccessTenant } from "./tenant-policy.js";

export type TenantContext = { organizationId: number; slug: string; name: string; role: string; principalType: "owner" | "service" | "member" };
const contexts = new WeakMap<Request, TenantContext>();
export const BOOTSTRAP_TENANT_SLUG = "customli";

export function getTenantContext(req: Request): TenantContext | null { return contexts.get(req) ?? null; }
export function requireResolvedTenant(req: Request): TenantContext {
  const value = getTenantContext(req);
  if (!value) throw new Error("Tenant context is required");
  return value;
}

function serviceAdmin(req: Request): boolean {
  const expected = process.env.MISSION_CONTROL_ADMIN_TOKEN?.trim();
  if (!expected) return false;
  const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : "";
  const header = typeof req.headers["x-admin-token"] === "string" ? req.headers["x-admin-token"].trim() : "";
  return bearer === expected || header === expected;
}

export async function resolveTenantContext(input: { requestedSlug?: string | null; principalType: "owner" | "service" | "member"; principalId: string }): Promise<TenantContext | null> {
  const requested = input.requestedSlug?.trim().toLowerCase() || BOOTSTRAP_TENANT_SLUG;
  const immediate = canPrincipalAccessTenant({ principalType: input.principalType, principalId: input.principalId, requestedSlug: requested, bootstrapSlug: BOOTSTRAP_TENANT_SLUG });
  if ((input.principalType === "owner" || input.principalType === "service") && !immediate.allowed) return null;
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, requested));
  if (!org || org.status !== "active") return null;
  if (input.principalType === "owner" || input.principalType === "service") return { organizationId: org.id, slug: org.slug, name: org.name, role: "owner", principalType: input.principalType };
  const [membership] = await db.select().from(organizationMembershipsTable).where(and(
    eq(organizationMembershipsTable.organizationId, org.id), eq(organizationMembershipsTable.principalType, "member"),
    eq(organizationMembershipsTable.principalId, input.principalId), eq(organizationMembershipsTable.status, "active"),
  ));
  if (!membership) return null;
  const decision = canPrincipalAccessTenant({ principalType: "member", principalId: input.principalId, requestedSlug: requested, bootstrapSlug: BOOTSTRAP_TENANT_SLUG, memberships: [{ slug: org.slug, principalId: membership.principalId, role: membership.role, status: membership.status }] });
  if (!decision.allowed || !decision.role) return null;
  return { organizationId: org.id, slug: org.slug, name: org.name, role: decision.role, principalType: "member" };
}

export async function requireTenantContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = ownerSessionFromRequest(req);
  const requested = typeof req.headers["x-mission-control-organization"] === "string" ? req.headers["x-mission-control-organization"] : null;
  const principal = session ? { principalType: "owner" as const, principalId: session.sub } : serviceAdmin(req) ? { principalType: "service" as const, principalId: "service-admin" } : null;
  if (!principal) { res.status(401).json({ error: "Authenticated tenant context required" }); return; }
  const tenant = await resolveTenantContext({ ...principal, requestedSlug: requested });
  if (!tenant) { res.status(403).json({ error: "Organization access denied" }); return; }
  contexts.set(req, tenant); next();
}
