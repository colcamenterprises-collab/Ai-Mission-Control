import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ordinary task creation is intercepted by canonical orchestrator before legacy tasks router", async () => {
  const index = await read("artifacts/api-server/src/routes/index.ts");
  const orchestrator = index.indexOf("router.use(orchestratorRouter)");
  const tasks = index.indexOf("router.use(tasksRouter)");
  assert.ok(orchestrator >= 0 && tasks > orchestrator, "orchestrator must intercept POST /tasks before legacy tasks router");

  const route = await read("artifacts/api-server/src/routes/orchestrator.ts");
  assert.match(route, /router\.post\("\/tasks"/);
  assert.match(route, /intakeActionableTask\(body\)/);
});

test("task intake derives or accepts explicit capabilities and uses governed resolver", async () => {
  const route = await read("artifacts/api-server/src/routes/orchestrator.ts");
  assert.match(route, /deriveCapabilities/);
  assert.match(route, /Array\.isArray\(record\.capabilities\)/);
  assert.match(route, /resolveCapabilities/);
  assert.match(route, /routing\.agentId && routing\.agentName/);
  assert.match(route, /"Unassigned"/);
});

test("routing decision and selected skill provenance are persisted with command context", async () => {
  const route = await read("artifacts/api-server/src/routes/orchestrator.ts");
  assert.match(route, /capabilityRouting:/);
  assert.match(route, /routingReason: routing\.routingReason/);
  assert.match(route, /selectedSkills: routing\.skills/);
  assert.match(route, /db\.update\(agentCommandsTable\)/);
});

test("governed resolver remains fail-closed for vault skills", async () => {
  const resolver = await read("artifacts/api-server/src/services/capability-router.ts");
  assert.match(resolver, /skill\.status === "approved"/);
  assert.match(resolver, /UNASSIGNED: no plugged-in agent satisfies capabilities/);
});
