import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../artifacts/api-server/src/routes/ground-zero-certification.ts", import.meta.url), "utf8");
const index = await readFile(new URL("../artifacts/api-server/src/routes/index.ts", import.meta.url), "utf8");
const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

test("Ground Zero exposes one unified preparation and certification surface", () => {
  assert.match(route, /\/ground-zero\/certification/);
  assert.match(route, /\/ground-zero\/prepare/);
  assert.match(route, /\/ground-zero\/certification-evidence\/:employee/);
  assert.match(index, /groundZeroCertificationRouter/);
});

test("mega preparation applies packs, model policy, canonical context and analyst recurrence together", () => {
  assert.match(route, /applyEmploymentPack\(amanda\.id, buildAmandaEmploymentPack\(\)\)/);
  assert.match(route, /applyEmploymentPack\(justin\.id, buildJustinEmploymentPack\(\)\)/);
  assert.match(route, /applyEmploymentPack\(analyst\.id, buildAIIntelligenceAnalystEmploymentPack\(\)\)/);
  assert.match(route, /seedRolePolicy\(agent\)/);
  assert.match(route, /syncCanonicalContextToWorkspace\(agent\.id\)/);
  assert.match(route, /ensureAnalystDailyTask\(analyst\)/);
});

test("certification never fabricates missing employees, access or runtime", () => {
  assert.match(route, /Employee record missing/);
  assert.match(route, /Justin Operations Manager employee record is missing/);
  assert.match(route, /runtimeConfigured: isRuntimeConfigured\(agent\)/);
  assert.match(route, /liveSystemNames/);
  assert.doesNotMatch(route, /status:\s*"READY"/);
});

test("mega regression tests are part of CI workflow", () => {
  assert.match(packageJson, /ground-zero-mega-certification\.test\.mjs/);
  assert.match(packageJson, /justin-operations-manager\.test\.ts/);
});
