import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Inbox promotion and direct creation converge on canonical orchestrator intake", async () => {
  const [schema, inboxRoute, directRoute, intake] = await Promise.all([
    read("lib/db/src/ensure-operational-schema.ts"),
    read("artifacts/api-server/src/routes/inbox.ts"),
    read("artifacts/api-server/src/routes/orchestrator.ts"),
    read("artifacts/api-server/src/services/orchestrator-intake.ts"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS inbox_items/);
  assert.match(schema, /linked_task_id integer UNIQUE/);
  assert.match(inboxRoute, /intakeActionableTask\([^;]+\{ inboxItemId: id \}/);
  assert.match(directRoute, /intakeActionableTask\(req\.body\)/);
  assert.doesNotMatch(inboxRoute, /insert\(tasksTable\)|chooseAgent|agentCommandsTable/);
  assert.match(intake, /\.for\("update"\)/);
  assert.match(intake, /if \(stored\.linkedTaskId\)/);
  assert.match(intake, /duplicatePrevented: true/);
  assert.match(intake, /description: stored\.content/);
  assert.match(intake, /approvalRequired: false/);
  assert.match(intake, /ownerReviewRequired: false/);
  assert.match(intake, /Orchestrator reviewed the task/);
  assert.match(intake, /insert\(agentCommandsTable\)/);
  assert.match(intake, /linkedTaskId: task\.id, reviewStatus: "promoted"/);
  assert.match(intake, /if \(dispatch\) void runAssignedWork\(dispatch\)/);
});

test("worker completion cannot directly reach Review or Done", async () => {
  const [bridge, tasks] = await Promise.all([read("artifacts/api-server/src/routes/agent-bridge.ts"), read("artifacts/api-server/src/routes/tasks.ts")]);
  assert.match(bridge, /status: "completion_pending"/);
  assert.match(await read("artifacts/api-server/src/routes/james-detached.ts"), /if \(result === "COMPLETED"\) return "completion_pending"/);
  assert.match(tasks, /task\.status !== "completion_pending"/);
  assert.match(tasks, /VERIFIED_COMPLETE/);
  assert.match(tasks, /worker completion alone is insufficient/);
  assert.match(tasks, /Owner acceptance requires a task in Review/);
  assert.match(tasks, /Use owner acceptance to move Review work to Done/);
});

test("blocked work and rework do not create approval records", async () => {
  const [bridge, tasks] = await Promise.all([read("artifacts/api-server/src/routes/agent-bridge.ts"), read("artifacts/api-server/src/routes/tasks.ts")]);
  assert.match(bridge, /taskStatus === "blocked" \? "blocked"/);
  assert.doesNotMatch(tasks, /orchestrator-completion-review[\s\S]*approvalRequestsTable/);
  assert.match(await read("artifacts/api-server/src/routes/james-detached.ts"), /Missing credentials or configuration require owner action, not Approve\/Reject controls/);
});

test("daily Inbox review uses existing detached systemd infrastructure without promoting work", async () => {
  const [route, runner, timer] = await Promise.all([read("artifacts/api-server/src/routes/james-detached.ts"), read("scripts/run-james-inbox-review.sh"), read("scripts/install-inbox-review-timer.sh")]);
  assert.match(route, /systemd-run/);
  assert.match(runner, /api\/inbox\/unreviewed/);
  assert.match(runner, /Do not create tasks/);
  assert.match(timer, /--on-calendar='\*-\*-\* 07:00:00'/);
});

test("owner rework retains the same task and acceptance retains Done before Archive", async () => {
  const tasks = await read("artifacts/api-server/src/routes/tasks.ts");
  assert.match(tasks, /OWNER REQUESTED CHANGES/);
  assert.match(tasks, /set\(\{ approvalRequired: false, status: "running" \}\)/);
  assert.match(tasks, /OWNER ACCEPTED/);
  assert.match(tasks, /Only completed tasks can be archived/);
});

test("integration secrets are encrypted and plaintext fields are removed from responses", async () => {
  const route = await read("artifacts/api-server/src/routes/integrations.ts");
  assert.match(route, /encryptSecret\(username/);
  assert.match(route, /encryptSecret\(password/);
  assert.match(route, /const \{ apiKey, username, password, customCredential, \.\.\.rest \} = row/);
});
