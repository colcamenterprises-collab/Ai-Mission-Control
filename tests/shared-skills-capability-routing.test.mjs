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

test("vault skills are fail-closed until approved and bad files are isolated", async () => {
  const service = await read("artifacts/api-server/src/services/shared-skills.ts");
  assert.match(service, /"needs-review"/);
  assert.match(service, /status === "approved"/);
  assert.match(service, /MISSION_CONTROL_SHARED_SKILLS_DIRS/);
  assert.match(service, /for \(const file of files\.sort\(\)\) \{/);
  assert.match(service, /errors\.push/);
  assert.match(service, /status: !found \? "not_found" : errors\.length \? "error" : "available"/);
});

test("capability router uses permission eligibility and only scans when capabilities exist", async () => {
  const service = await read("artifacts/api-server/src/services/capability-router.ts");
  assert.match(service, /evaluateAgentEligibility/);
  assert.match(service, /skill\.status === "approved"/);
  assert.match(service, /requiredCapabilities/);
  assert.match(service, /isPluggedIn/);
  const noCapabilities = service.indexOf("if (requiredCapabilities.length === 0)");
  const sharedScan = service.indexOf("listSharedSkills()");
  assert.ok(noCapabilities >= 0 && sharedScan > noCapabilities, "requests without capabilities must return before scanning the vault");
});

test("skills API exposes explicit governance states", async () => {
  const route = await read("artifacts/api-server/src/routes/skills.ts");
  for (const status of ["proposed", "needs-review", "approved", "deprecated"]) {
    assert.ok(route.includes(`"${status}"`), `missing governance state ${status}`);
  }
  assert.match(route, /setSharedSkillStatus/);
});

test("agent skill endpoints expose approved shared skills before the legacy bridge", async () => {
  const routes = await read("artifacts/api-server/src/routes/index.ts");
  const sharedAgentSkills = routes.indexOf("router.use(agentSkillsRouter)");
  const legacyBridge = routes.indexOf("router.use(agentBridgeRouter)");
  assert.ok(sharedAgentSkills >= 0 && legacyBridge > sharedAgentSkills, "governed agent skill router must intercept skill requests first");
  const route = await read("artifacts/api-server/src/routes/agent-skills.ts");
  assert.match(route, /listSharedSkills/);
  assert.match(route, /readSharedSkill/);
  assert.match(route, /skill\.status !== "approved"/);
  assert.match(route, /id\.startsWith\("vault:"\)/);
});

test("vault IDs only resolve discovered regular SKILL.md files inside the real root", async () => {
  const service = await read("artifacts/api-server/src/services/shared-skills.ts");
  assert.match(service, /path\.basename\(lexicalFile\)\.toLowerCase\(\) !== "skill\.md"/);
  assert.match(service, /await Promise\.all\(\[realpath\(root\), realpath\(lexicalFile\)\]\)/);
  assert.match(service, /info\?\.isFile\(\)/);
  assert.match(service, /discoveredReal\.has\(realFile\)/);
});

test("routed instructions are persisted transactionally when an execution is created", async () => {
  const route = await read("artifacts/api-server/src/routes/executions.ts");
  assert.match(route, /normalizeInstructions\(req\.body\?\.instructions\)/);
  assert.match(route, /db\.transaction\(async \(tx\)/);
  assert.match(route, /tx\.insert\(executionInstructionsTable\)/);
  assert.match(route, /requestId: created\.id/);
});

test("execution detail reads canonical instructions and does not mutate them on GET", async () => {
  const route = await read("artifacts/api-server/src/routes/executions.ts");
  const detailStart = route.indexOf('router.get("/executions/:id"');
  const createStart = route.indexOf('router.post("/executions"');
  assert.ok(detailStart >= 0 && createStart > detailStart, "execution detail route must precede create route");
  const detail = route.slice(detailStart, createStart);
  assert.match(detail, /from\(executionInstructionsTable\)/);
  assert.match(detail, /instructions,/);
  assert.doesNotMatch(detail, /insert\(executionInstructionsTable\)/);
  assert.doesNotMatch(detail, /req\.body\?\.instructions/);
});
