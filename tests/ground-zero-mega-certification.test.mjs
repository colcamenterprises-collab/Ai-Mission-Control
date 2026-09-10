import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../artifacts/api-server/src/routes/ground-zero-certification.ts", import.meta.url), "utf8");
const index = await readFile(new URL("../artifacts/api-server/src/routes/index.ts", import.meta.url), "utf8");
const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

test("Ground Zero exposes one unified preparation and certification surface", () => {
  assert.match(route, /\/ground-zero\/certification/);
  assert.match(route, /\/ground-zero\/prepare/);
  assert.match(route, /\/ground-zero\/live-probe/);
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

test("certification never fabricates missing employees, access, runtime or context readiness", () => {
  assert.match(route, /Employee record missing/);
  assert.match(route, /employee record is missing/);
  assert.match(route, /runtimeConfigured: isRuntimeConfigured\(agent\)/);
  assert.match(route, /liveSystemNames/);
  assert.match(route, /canonical context is not ready/);
  assert.match(route, /readyForEndToEndCertification: gaps\.length === 0/);
  assert.doesNotMatch(route, /status:\s*"READY"/);
});

test("live probe is fail-closed when Ground Zero prerequisites are not ready", () => {
  assert.match(route, /if \(!status\.readyForEndToEndCertification\)/);
  assert.match(route, /res\.status\(409\)/);
  assert.match(route, /live model probes were not started/);
});

test("live probe exercises actual configured runtimes with role-specific context checks", () => {
  assert.match(route, /dispatchRuntime\(probe\.agent/);
  assert.match(route, /mode: "test"/);
  assert.match(route, /company guiding rule/);
  assert.match(route, /role boundary with Justin/);
  assert.match(route, /operational ownership and your boundary with Amanda/);
  assert.match(route, /what qualifies for the AI Intelligence Brief/);
});

test("role-awareness probes are deterministic and prohibit tool or research side effects", () => {
  assert.match(route, /Certification-only role check/);
  assert.match(route, /Answer only from the canonical context supplied in this request/);
  assert.match(route, /Do not browse the web, call tools, inspect files, run commands, perform work, or contact external systems/);
  assert.match(route, /Do not retry or start a research workflow/);
});

test("mega regression tests are part of CI workflow", () => {
  assert.match(packageJson, /ground-zero-mega-certification\.test\.mjs/);
  assert.match(packageJson, /justin-operations-manager\.test\.ts/);
});
