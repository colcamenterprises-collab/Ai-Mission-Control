import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("canonical intake never directly dispatches a runtime", async () => {
  const source = await read("artifacts/api-server/src/services/orchestrator-intake.ts");
  assert.match(source, /createGovernedWorkRequest/);
  assert.doesNotMatch(source, /dispatchRuntime|agentCommandsTable/);
});

test("canonical task control intercepts actionable task routes before legacy tasks", async () => {
  const source = await read("artifacts/api-server/src/routes/index.ts");
  const canonical = source.indexOf("router.use(canonicalTaskControlRouter)");
  const legacy = source.indexOf("router.use(tasksRouter)");
  assert.ok(canonical >= 0 && legacy >= 0 && canonical < legacy);
});

test("task approval resolves the durable approvals table and work request", async () => {
  const source = await read("artifacts/api-server/src/routes/canonical-task-control.ts");
  assert.match(source, /approvalsTable/);
  assert.match(source, /workRequestsTable/);
  assert.match(source, /transitionWorkRequest\(row\.request, "approved"/);
  assert.doesNotMatch(source, /dispatchRuntime|agentCommandsTable/);
});

test("task messages and requested changes create governed work instead of commands", async () => {
  const source = await read("artifacts/api-server/src/routes/canonical-task-control.ts");
  assert.match(source, /createTaskFollowUp/);
  assert.match(source, /createGovernedWorkRequest/);
  assert.match(source, /No direct runtime dispatch was used/);
});
