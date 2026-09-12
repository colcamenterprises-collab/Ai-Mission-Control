import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("WhatsApp is canonical intake and cannot dispatch an agent runtime directly", () => {
  const route = read("artifacts/api-server/src/routes/whatsapp.ts");
  assert.match(route, /intakeExternalTask/);
  assert.doesNotMatch(route, /dispatchRuntime/);
  assert.doesNotMatch(route, /const seen = new Map/);
  assert.match(route, /message_id_required/);
  assert.match(route, /OWNER_APPROVAL/);
});

test("external intake persists source metadata, audit and durable idempotency", () => {
  const source = read("artifacts/api-server/src/services/external-intake.ts");
  for (const token of [
    "executionKeyFor",
    "externalId",
    "conversationId",
    "senderId",
    "external_intake.received",
    "workRequestsTable",
    "delegationPolicy",
    "onConflictDoNothing",
  ])
    assert.match(source, new RegExp(token));
  assert.match(source, /approvalDecision === "OWNER_APPROVAL"/);
  assert.match(source, /requiredAuthority:/);
});

test("ordinary task intake cannot dispatch before canonical approval", () => {
  const source = read(
    "artifacts/api-server/src/services/orchestrator-intake.ts",
  );
  assert.match(source, /request\.state === "approved"/);
  assert.match(source, /Work Request is the authorization boundary/);
});

test("L2 orchestrator authorization is explicit and auditable before execution", () => {
  const control = read(
    "artifacts/api-server/src/services/task-execution-control.ts",
  );
  const supervisor = read(
    "artifacts/api-server/src/services/task-supervisor.ts",
  );
  assert.match(control, /authorizeOrchestratorApproval/);
  assert.match(control, /ORCHESTRATOR_APPROVAL/);
  assert.match(control, /transitionWorkRequest\(request, "approved"/);
  assert.match(supervisor, /authorizeOrchestratorApproval/);
  assert.match(supervisor, /latestRequest\?\.state === "awaiting_approval"/);
});
