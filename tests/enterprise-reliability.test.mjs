import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bridge = fs.readFileSync(
  "artifacts/api-server/src/routes/agent-bridge.ts",
  "utf8",
);
const leases = fs.readFileSync(
  "artifacts/api-server/src/services/execution-lease-maintenance.ts",
  "utf8",
);
const index = fs.readFileSync("artifacts/api-server/src/index.ts", "utf8");
const harness = fs.readFileSync(
  "artifacts/api-server/src/services/agentic-harness.ts",
  "utf8",
);
const execution = fs.readFileSync(
  "artifacts/api-server/src/services/task-execution-control.ts",
  "utf8",
);

test("worker ownership is acquired while request is approved before dispatch", () => {
  const claim = bridge.indexOf("claimedByAgentId: agent.id");
  const dispatch = bridge.indexOf(
    'transitionWorkRequest(claimed, "dispatched"',
    claim,
  );
  assert.ok(claim >= 0 && dispatch > claim);
  const claimWindow = bridge.slice(Math.max(0, claim - 700), dispatch);
  assert.match(claimWindow, /eq\(workRequestsTable\.state, "approved"\)/);
  assert.match(bridge, /eq\(workRequestsTable\.claimedByAgentId, agent\.id\)/);
});

test("lease recovery covers orphan dispatch and fails side effects closed", () => {
  assert.match(leases, /"dispatched",\s*"acknowledged",\s*"running"/);
  assert.match(leases, /idempotencyClass === "read_only"/);
  assert.match(leases, /automatic retry prohibited/);
  assert.match(leases, /claimedByAgentId: null/);
  assert.match(leases, /eventType: "execution\.lease_expired"/);
});

test("lease recovery runs automatically in supervision loop", () => {
  assert.match(index, /await expireExecutionLeases\(\)/);
  assert.ok(
    index.indexOf("expireExecutionLeases") <
      index.lastIndexOf("superviseActiveTasks"),
  );
});

test("completion verifier cannot equal declared executor", () => {
  assert.match(
    harness,
    /verifiedBy\.toLowerCase\(\) !== executedBy\.toLowerCase\(\)/,
  );
  assert.match(harness, /independent verification required/);
  assert.match(execution, /executedBy: `agent:\$\{request\.agentId\}`/);
});
