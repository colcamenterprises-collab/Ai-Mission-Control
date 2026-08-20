import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTransition,
  canTransition,
  evaluateApproval,
  redactSensitive,
} from "../artifacts/api-server/src/services/execution-policy.js";

test("lifecycle permits required forward paths and rejects invalid transitions", () => {
  const path = [
    "draft",
    "queued",
    "awaiting_approval",
    "approved",
    "dispatched",
    "acknowledged",
    "running",
    "completed",
  ] as const;
  for (let index = 0; index < path.length - 1; index += 1)
    assert.equal(canTransition(path[index], path[index + 1]), true);
  assert.equal(canTransition("running", "failed"), true);
  assert.equal(canTransition("awaiting_approval", "rejected"), true);
  assert.equal(canTransition("awaiting_approval", "blocked"), true);
  assert.throws(
    () => assertTransition("awaiting_approval", "dispatched"),
    /Invalid work request transition/,
  );
  assert.throws(
    () => assertTransition("rejected", "dispatched"),
    /Invalid work request transition/,
  );
});

test("risk policy never bypasses owner or prohibited gates", () => {
  assert.equal(evaluateApproval({ riskLevel: 0 }), "AUTO_EXECUTE");
  assert.equal(evaluateApproval({ riskLevel: 1 }), "AUTO_EXECUTE");
  assert.equal(evaluateApproval({ riskLevel: 2 }), "OWNER_APPROVAL");
  assert.equal(
    evaluateApproval({ riskLevel: 2, agentCanAutoApprove: true }),
    "ORCHESTRATOR_APPROVAL",
  );
  assert.equal(evaluateApproval({ riskLevel: 3 }), "OWNER_APPROVAL");
  assert.equal(
    evaluateApproval({ riskLevel: 4, standingOwnerAuthority: true }),
    "DENIED",
  );
});

test("redaction removes secrets recursively from audit and reports", () => {
  const redacted = redactSensitive({
    authorization: "Bearer live-secret",
    nested: {
      apiKey: "sk-supersecret123",
      message: "use Bearer abc.def.ghi",
      github: "ghp_123456789abcdef",
    },
  });
  const output = JSON.stringify(redacted);
  assert.doesNotMatch(
    output,
    /live-secret|supersecret|abc\.def\.ghi|123456789abcdef/,
  );
  assert.match(output, /REDACTED/);
});
