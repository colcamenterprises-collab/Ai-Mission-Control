import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("capability routing is mounted before the existing executions lifecycle", async () => {
  const routes = await read("artifacts/api-server/src/routes/index.ts");
  const routing = routes.indexOf("router.use(capabilityRoutingRouter)");
  const executions = routes.indexOf("router.use(executionsRouter)");
  assert.ok(routing >= 0, "capability routing middleware must be mounted");
  assert.ok(executions >= 0, "existing executions router must remain mounted");
  assert.ok(routing < executions, "capability routing must run before the existing lifecycle");
});

test("vault skills are fail-closed until approved", async () => {
  const service = await read("artifacts/api-server/src/services/shared-skills.ts");
  assert.match(service, /"needs-review"/);
  assert.match(service, /status === "approved"/);
  assert.match(service, /MISSION_CONTROL_SHARED_SKILLS_DIRS/);
});

test("capability router uses permission eligibility and only approved vault skills", async () => {
  const service = await read("artifacts/api-server/src/services/capability-router.ts");
  assert.match(service, /evaluateAgentEligibility/);
  assert.match(service, /skill\.status === "approved"/);
  assert.match(service, /requiredCapabilities/);
  assert.match(service, /isPluggedIn/);
});

test("skills API exposes explicit governance states", async () => {
  const route = await read("artifacts/api-server/src/routes/skills.ts");
  for (const status of ["proposed", "needs-review", "approved", "deprecated"]) {
    assert.ok(route.includes(`"${status}"`), `missing governance state ${status}`);
  }
  assert.match(route, /setSharedSkillStatus/);
});
