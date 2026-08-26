import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("agent execution state is derived centrally from work request lifecycle", async () => {
  const runtime = await read("artifacts/api-server/src/services/execution-runtime.ts");
  assert.match(runtime, /reconcileAgentStates/);
  assert.match(runtime, /ACTIVE_WORK_STATES/);
  assert.match(runtime, /leaseExpiresAt/);
  assert.match(runtime, /status: "active"/);
  assert.match(runtime, /status: otherActive \? "active" : "idle"/);
  assert.match(runtime, /currentTask: otherActive \? otherActive\.requestedAction : null/);
});

test("agent reconciliation preserves legitimate runtime error and pending states", async () => {
  const runtime = await read("artifacts/api-server/src/services/execution-runtime.ts");
  assert.match(runtime, /\["error", "pending"\]\.includes\(agent\.status\)/);
  assert.match(runtime, /\? agent\.status\s*:\s*"idle"/);
});

test("agent list reconciles stale state instead of trusting cached Amanda or James rows", async () => {
  const route = await read("artifacts/api-server/src/routes/agents.ts");
  const listStart = route.indexOf('router.get("/agents"');
  assert.ok(listStart >= 0, "agents list route must exist");
  const list = route.slice(listStart, route.indexOf('router.post("/agents"'));
  assert.match(list, /await reconcileAgentStates\(\)/);
  assert.doesNotMatch(route, /Amanda.*status|James.*status/i);
});

test("authenticated employees can discover the shared company skill library", async () => {
  const route = await read("artifacts/api-server/src/routes/agent-skills.ts");
  assert.match(route, /getAgentFromBearer/);
  assert.match(route, /skills: \[\.\.\.native\.skills, \.\.\.approvedShared\]/);
  assert.match(route, /accessModel: "shared-company-capability"/);
  assert.doesNotMatch(route, /getAssignedSkillNamesForAgent/);
  assert.doesNotMatch(route, /isGranted/);
});

test("shared vault skills still require company approval and an enabled source", async () => {
  const route = await read("artifacts/api-server/src/routes/agent-skills.ts");
  assert.match(route, /skill\.status !== "approved"/);
  assert.match(route, /skill\.source\.enabled !== true/);
});

test("work eligibility no longer duplicates per-employee capability grants", async () => {
  const permissions = await read("artifacts/api-server/src/services/execution-permissions.ts");
  assert.match(permissions, /Company capabilities are shared infrastructure/);
  assert.match(permissions, /eligible: true/);
  assert.match(permissions, /code: "ELIGIBLE"/);
  assert.doesNotMatch(permissions, /agentExecutionScopesTable/);
  assert.doesNotMatch(permissions, /agentToolAccessTable/);
});
