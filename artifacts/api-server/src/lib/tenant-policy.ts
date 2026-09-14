export type TenantPrincipalType = "owner" | "service" | "member";
export type TenantMembershipGrant = { slug: string; principalId: string; role: string; status: string };

export function canPrincipalAccessTenant(input: {
  principalType: TenantPrincipalType;
  principalId: string;
  requestedSlug: string;
  bootstrapSlug: string;
  memberships?: TenantMembershipGrant[];
}): { allowed: boolean; role: string | null } {
  if (input.principalType === "owner" || input.principalType === "service") {
    return input.requestedSlug === input.bootstrapSlug
      ? { allowed: true, role: "owner" }
      : { allowed: false, role: null };
  }
  const grant = (input.memberships ?? []).find(
    (membership) =>
      membership.slug === input.requestedSlug &&
      membership.principalId === input.principalId &&
      membership.status === "active",
  );
  return grant ? { allowed: true, role: grant.role } : { allowed: false, role: null };
}
