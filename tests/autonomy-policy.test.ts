import assert from "node:assert/strict";
import test from "node:test";
import { delegationDecision, supervisionAction } from "../artifacts/api-server/src/services/autonomy-policy.js";

test("risk 0-1 stays inside automatic orchestrator delegation", () => {
  assert.equal(delegationDecision({ status: "blocked", approvalRequired: false, riskLevel: 0 }).authority, "ORCHESTRATOR");
  assert.equal(delegationDecision({ status: "blocked", approvalRequired: false, riskLevel: 1 }).authority, "ORCHESTRATOR");
});

test("execution policy decisions remain authoritative", () => {
  assert.equal(delegationDecision({ status: "blocked", approvalRequired: false, riskLevel: 2, approvalDecision: "ORCHESTRATOR_APPROVAL" }).authority, "ORCHESTRATOR");
  assert.equal(delegationDecision({ status: "blocked", approvalRequired: false, riskLevel: 2, approvalDecision: "OWNER_APPROVAL" }).authority, "OWNER");
  assert.equal(delegationDecision({ status: "blocked", approvalRequired: false, riskLevel: 4, approvalDecision: "DENIED" }).authority, "OWNER");
});

test("explicit owner approval can never be bypassed by supervision", () => {
  assert.equal(delegationDecision({ status: "running", approvalRequired: true, riskLevel: 0, approvalDecision: "AUTO_EXECUTE" }).authority, "OWNER");
});

test("unknown risk 2+ is conservative without an explicit approval decision", () => {
  assert.equal(delegationDecision({ status: "blocked", approvalRequired: false, riskLevel: 2 }).authority, "OWNER");
  assert.equal(delegationDecision({ status: "blocked", approvalRequired: false, riskLevel: 3 }).authority, "OWNER");
});

test("blocked and stale work receives a concrete orchestrator action", () => {
  assert.match(supervisionAction("blocked"), /Investigate the blocker/);
  assert.match(supervisionAction("running"), /Review current progress/);
});
