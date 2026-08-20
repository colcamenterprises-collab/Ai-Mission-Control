import assert from "node:assert/strict";
import test from "node:test";
import { routeVerifiedCompletion } from "../artifacts/api-server/src/services/task-completion-policy.ts";

test("objective verified work skips Review and reaches Done", () => {
  assert.deepEqual(routeVerifiedCompletion({ decision: "VERIFIED_COMPLETE", ownerReviewRequired: false, escalatedOwnerReview: false }), {
    status: "done", timelineEvent: "ORCHESTRATOR VERIFIED COMPLETE",
  });
});

test("explicit owner review routes verified work to Review", () => {
  assert.equal(routeVerifiedCompletion({ decision: "VERIFIED_COMPLETE", ownerReviewRequired: true, escalatedOwnerReview: false, reviewReason: "Owner must accept the customer-facing copy." }).status, "review");
});

test("orchestrator escalation requires a factual human-judgment reason", () => {
  assert.throws(() => routeVerifiedCompletion({ decision: "VERIFIED_COMPLETE", ownerReviewRequired: false, escalatedOwnerReview: true }), /factual owner-review reason/);
  assert.equal(routeVerifiedCompletion({ decision: "VERIFIED_COMPLETE", ownerReviewRequired: false, escalatedOwnerReview: true, reviewReason: "No objective criterion determines the preferred visual layout." }).status, "review");
});

test("failed verification returns the same work to Doing regardless of review flags", () => {
  assert.equal(routeVerifiedCompletion({ decision: "REWORK_REQUIRED", ownerReviewRequired: true, escalatedOwnerReview: true }).status, "running");
});

test("Agent Reach objective install regression reaches Done without Review or Approval", () => {
  const task = { title: "Review and install Agent Reach", approvalRequired: false, ownerReviewRequired: false };
  const evidence = ["Agent Reach v1.5.0 installed", "installation path and version verified", "agent-reach doctor completed", "optional integrations documented"];
  assert.equal(task.approvalRequired, false);
  assert.ok(evidence.length >= 4);
  const route = routeVerifiedCompletion({ decision: "VERIFIED_COMPLETE", ownerReviewRequired: task.ownerReviewRequired, escalatedOwnerReview: false });
  assert.equal(route.status, "done");
  assert.notEqual(route.status, "review");
});
