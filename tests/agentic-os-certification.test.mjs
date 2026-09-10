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

test("terminal certification preserves production work, refreshes roles and gates live probes", () => {
  assert.match(script, /Clean stale certification Tasks without deleting production work/);
  assert.match(script, /purge_stale_cert_tasks "\/api\/tasks"/);
  assert.match(script, /purge_stale_cert_tasks "\/api\/tasks\/archived"/);
  assert.match(script, /startsWith\("CERT-1\.6"\)/);
  assert.match(script, /\/api\/ground-zero\/prepare/);
  assert.match(script, /\/api\/ground-zero\/live-probe/);
  assert.match(script, /readyForEndToEndCertification/);
  assert.match(script, /Ground Zero prerequisites failed\. No live role-awareness model calls started/);
});

test("paid end-to-end execution is skipped when readiness or live role probes fail", () => {
  assert.match(script, /LIVE_READY=false/);
  assert.match(script, /\[\[ "\$READY" == "true" && "\$LIVE_READY" == "true" \]\]/);
  assert.match(script, /James\/Amanda task execution was not started, preventing unnecessary model spend/);
});

test("terminal certification exercises real execution, delegation and approval gate when prerequisites pass", () => {
  assert.match(script, /SAFE EXECUTION/);
  assert.match(script, /AMANDA DELEGATION/);
  assert.match(script, /PROTECTED DEPLOY GATE/);
  assert.match(script, /awaiting_approval/);
  assert.match(script, /production_change/);
  assert.match(script, /result\?\.agenticHarness\?\.passed/);
  assert.match(script, /CERT_TASK_IDS/);
});

test("certification network calls and waits are bounded", () => {
  assert.match(script, /--connect-timeout 3/);
  assert.match(script, /--max-time 20/);
  assert.match(script, /LONG_CURL=.*--max-time 300/);
  assert.match(script, /api_post_long "\/api\/ground-zero\/live-probe"/);
  assert.match(script, /\[WAIT\] Task/);
  assert.match(script, /wait_task "\$TASK1" 240/);
});

test("live probe timeout cannot crash certification on empty JSON", () => {
  assert.match(script, /json_valid\(\)/);
  assert.match(script, /Live role-awareness probe request failed or exceeded the 300-second certification timeout/);
  assert.match(script, /Paid end-to-end execution will remain disabled for this run/);
  assert.match(script, /empty or invalid JSON response/);
});

test("certification writes durable reports and exits non-zero on any failed check", () => {
  assert.match(script, /\/var\/lib\/ai-mission-control\/certifications/);
  assert.match(script, /AGENTIC OS 1\.6 CERTIFICATION: PASS/);
  assert.match(script, /AGENTIC OS 1\.6 CERTIFICATION: FAIL/);
  assert.match(script, /exit 1/);
});
