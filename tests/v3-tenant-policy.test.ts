import test from "node:test";
import assert from "node:assert/strict";
import { canPrincipalAccessTenant } from "../artifacts/api-server/src/lib/tenant-policy.ts";

const base = { bootstrapSlug: "customli", principalId: "owner-1" };
test("bootstrap owner resolves only the bootstrap tenant", () => {
  assert.equal(canPrincipalAccessTenant({ ...base, principalType: "owner", requestedSlug: "customli" }).allowed, true);
  assert.equal(canPrincipalAccessTenant({ ...base, principalType: "owner", requestedSlug: "tenant-b" }).allowed, false);
});
test("service admin cannot arbitrarily switch organizations", () => {
  assert.equal(canPrincipalAccessTenant({ ...base, principalType: "service", requestedSlug: "tenant-b" }).allowed, false);
});
test("tenant B member cannot resolve tenant A", () => {
  const memberships = [{ slug: "tenant-b", principalId: "member-b", role: "admin", status: "active" }];
  assert.equal(canPrincipalAccessTenant({ principalType: "member", principalId: "member-b", requestedSlug: "tenant-b", bootstrapSlug: "customli", memberships }).allowed, true);
  assert.equal(canPrincipalAccessTenant({ principalType: "member", principalId: "member-b", requestedSlug: "tenant-a", bootstrapSlug: "customli", memberships }).allowed, false);
});
test("inactive membership fails closed", () => {
  const memberships = [{ slug: "tenant-b", principalId: "member-b", role: "admin", status: "disabled" }];
  assert.equal(canPrincipalAccessTenant({ principalType: "member", principalId: "member-b", requestedSlug: "tenant-b", bootstrapSlug: "customli", memberships }).allowed, false);
});
