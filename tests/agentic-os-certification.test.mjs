import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../artifacts/api-server/src/routes/agentic-os-certification.ts", import.meta.url), "utf8");
const index = await readFile(new URL("../artifacts/api-server/src/routes/index.ts", import.meta.url), "utf8");
const script = await readFile(new URL("../scripts/certify-agentic-os-1.6.sh", import.meta.url), "utf8");

test("live certification proves fail-closed evals, replay and corrected completion", () => {
  assert.match(route, /agentic-os\/certification\/probe/);
  assert.match(route, /evidence:\s*\[\]/);
  assert.match(route, /failedAttempt\?\.state === "running"/);
  assert.match(route, /failureReplayLog/);
  assert.match(route, /verifiedBy: "James Hermes"/);
  assert.match(route, /completed\?\.state === "completed"/);
  assert.match(route, /protectedCapabilityDetected/);
  assert.match(index, /agenticOsCertificationRouter/);
});

test("terminal certification starts clean, refreshes agent roles and runs live probes", () => {
  assert.match(script, /Remove obsolete Tasks/);
  assert.match(script, /purge_task_list "\/api\/tasks"/);
  assert.match(script, /purge_task_list "\/api\/tasks\/archived"/);
  assert.match(script, /\/api\/ground-zero\/prepare/);
  assert.match(script, /\/api\/ground-zero\/live-probe/);
  assert.match(script, /readyForEndToEndCertification/);
});

test("terminal certification exercises real execution, delegation and approval gate", () => {
  assert.match(script, /SAFE EXECUTION/);
  assert.match(script, /AMANDA DELEGATION/);
  assert.match(script, /PROTECTED DEPLOY GATE/);
  assert.match(script, /awaiting_approval/);
  assert.match(script, /production_change/);
  assert.match(script, /result\?\.agenticHarness\?\.passed/);
  assert.match(script, /CERT_TASK_IDS/);
});

test("certification writes durable reports and exits non-zero on any failed check", () => {
  assert.match(script, /\/var\/lib\/ai-mission-control\/certifications/);
  assert.match(script, /AGENTIC OS 1\.6 CERTIFICATION: PASS/);
  assert.match(script, /AGENTIC OS 1\.6 CERTIFICATION: FAIL/);
  assert.match(script, /exit 1/);
});
