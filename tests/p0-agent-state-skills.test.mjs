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

test("skill assignments are durable grants rather than runtime name rules", async () => {
  const config = await read("artifacts/api-server/src/config-operational-agents.ts");
  assert.match(config, /agentExecutionScopesTable/);
  assert.match(config, /scopeType, "skill"/);
  assert.match(config, /initializeAgentSkillAssignments/);
  assert.match(config, /legacy-bootstrap/);
  assert.match(config, /NO_SKILLS_SENTINEL/);
  assert.match(config, /setAssignedSkillNamesForAgent/);
});

test("an explicit empty grant survives restart and cannot silently restore legacy skills", async () => {
  const config = await read("artifacts/api-server/src/config-operational-agents.ts");
  assert.match(config, /normalized\.length \? normalized : \[NO_SKILLS_SENTINEL\]/);
  assert.match(config, /skill !== NO_SKILLS_SENTINEL/);
});

test("authenticated agents can only read explicitly granted skills", async () => {
  const route = await read("artifacts/api-server/src/routes/agent-skills.ts");
  assert.match(route, /getAssignedSkillNamesForAgent/);
  assert.match(route, /isGranted/);
  assert.match(route, /grantedNative/);
  assert.match(route, /!isGranted\(selectors, skill\)/);
  assert.match(route, /skill\.status !== "approved"/);
});

test("Mission Control exposes an audited durable skill assignment endpoint", async () => {
  const route = await read("artifacts/api-server/src/routes/agents.ts");
  assert.match(route, /router\.put\("\/agents\/:id\/skills"/);
  assert.match(route, /setAssignedSkillNamesForAgent/);
  assert.match(route, /action: "skills_updated"/);
});

test("skill grant cache is initialized before the API starts listening", async () => {
  const entry = await read("artifacts/api-server/src/index.ts");
  const init = entry.indexOf("await initializeAgentSkillAssignments()");
  const listen = entry.indexOf("app.listen");
  assert.ok(init >= 0 && listen > init, "durable skill grants must load before accepting requests");
});
