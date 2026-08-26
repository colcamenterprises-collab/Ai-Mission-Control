import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("health route separates liveness from operational readiness", () => {
  const source = read("artifacts/api-server/src/routes/health.ts");
  assert.match(source, /router\.get\("\/healthz"/);
  assert.match(source, /router\.get\("\/readyz"/);
  assert.match(source, /getOperationalReadiness/);
  assert.match(source, /503/);
});

test("operational readiness verifies critical stores and routable agents", () => {
  const source = read("artifacts/api-server/src/services/operational-readiness.ts");
  for (const token of ["agentsTable", "tasksTable", "workRequestsTable", "approvalsTable", "agentRuntimeInstancesTable", "routableAgents"]) {
    assert.ok(source.includes(token), `missing readiness dependency: ${token}`);
  }
  assert.match(source, /No employee has a usable runtime route/);
});

test("production smoke covers the business operating surfaces", () => {
  const source = read("scripts/smoke-operational.mjs");
  for (const path of ["/api/readyz", "/api/agents", "/api/tasks", "/api/inbox", "/api/executions", "/api/approvals", "/api/provisioning/overview", "/api/employee-factory/profiles", "/api/skills", "/api/memories"]) {
    assert.ok(source.includes(path), `smoke missing ${path}`);
  }
  assert.match(source, /no routable AI employee is available/);
});

test("deploy test gate includes operational suites", () => {
  const packageJson = JSON.parse(read("package.json"));
  const gate = packageJson.scripts["test:skills"];
  assert.match(gate, /operational-readiness/);
  assert.match(gate, /test:operational-schema/);
  assert.match(gate, /test:execution/);
  assert.match(gate, /test:workflow/);
});
