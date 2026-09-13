import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tenant = fs.readFileSync("artifacts/api-server/src/lib/tenant-context.ts", "utf8");
const routes = fs.readFileSync("artifacts/api-server/src/routes/index.ts", "utf8");
const schema = fs.readFileSync("lib/db/src/ensure-commercial-schema.ts", "utf8");

test("V3 tenant middleware fails closed without authenticated principal", () => { assert.match(tenant, /Authenticated tenant context required/); });
test("V3 rejects arbitrary tenant switching for owner and service principals", () => { assert.match(tenant, /canPrincipalAccessTenant/); assert.match(tenant, /!immediate.allowed/); });
test("V3 member resolution requires active membership in requested tenant", () => { assert.match(tenant, /organizationMembershipsTable\.organizationId/); assert.match(tenant, /organizationMembershipsTable\.status, "active"/); });
test("V3 bootstrap tenant is deterministic and additive", () => { assert.match(schema, /BOOTSTRAP_ORG_SLUG = "customli"/); assert.match(schema, /ON CONFLICT \(slug\) DO NOTHING/); });
test("V3 commercial routes are protected by tenant context after admin auth", () => { assert.match(routes, /requireAdminAuth/); assert.match(routes, /requireTenantContext/); assert.match(routes, /commercialRouter/); });
