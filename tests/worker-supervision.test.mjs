import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const intake = fs.readFileSync("artifacts/api-server/src/services/orchestrator-intake.ts", "utf8");
const tasks = fs.readFileSync("artifacts/api-server/src/routes/tasks.ts", "utf8");
const jamesDetached = fs.readFileSync("artifacts/api-server/src/routes/james-detached.ts", "utf8");
const supervision = fs.readFileSync("artifacts/api-server/src/services/worker-supervision.ts", "utf8");
const taskSupervisor = fs.readFileSync("artifacts/api-server/src/services/task-supervisor.ts", "utf8");
const executionControl = fs.readFileSync("artifacts/api-server/src/services/task-execution-control.ts", "utf8");
const supervisionRoute = fs.readFileSync("artifacts/api-server/src/routes/worker-supervision.ts", "utf8");
const runner = fs.readFileSync("scripts/run-james-completion-review.sh", "utf8");
const routeIndex = fs.readFileSync("artifacts/api-server/src/routes/index.ts", "utf8");

test("normal specialist completion cannot self-certify Review or Done", () => {
  assert.match(intake, /status:\s*"completion_pending"/);
  assert.match(intake, /queueJamesCompletionReview\(task\.id, agent\.name/);
  assert.doesNotMatch(intake, /const nextStatus = runtimeResult\.ok \? \(task\.approvalRequired \? "review"/);
});

test("task conversation follow-ups also enter mandatory James QA", () => {
  assert.match(tasks, /status:\s*"completion_pending"/);
  assert.match(tasks, /queueJamesCompletionReview\(task\.id, agent\.name/);
  assert.doesNotMatch(tasks, /status: result\.ok \? "review" : "blocked"/);
});

test("detached James execution gets a separate fresh supervisory pass", () => {
  assert.match(jamesDetached, /if \(result === "COMPLETED"\)/);
  assert.match(jamesDetached, /queueJamesCompletionReview\(taskId, "James Hermes", body\)/);
  assert.match(supervision, /Perform a fresh verification pass even when James Hermes was also the executing worker/);
});

test("trivial acknowledgement tasks are classified and constrained", () => {
  assert.match(supervision, /acknowledgement_test/);
  assert.match(supervision, /nothing required\|no action required\|just checking/);
  assert.match(intake, /Do not perform operational work, browse unrelated context, make readiness claims, or produce a long report/);
});

test("raw runtime telemetry is withheld from owner task conversation", () => {
  assert.match(supervision, /systemPromptReport/);
  assert.match(supervision, /Detailed runtime telemetry was retained in the execution audit and withheld from the owner conversation/);
  assert.match(intake, /humanReadableWorkerOutput\(runtimeResult\.output\)/);
  assert.match(tasks, /humanReadableWorkerOutput\(result\.output\)/);
});

test("Ground Zero canonical Task intake immediately creates an execution request", () => {
  assert.match(intake, /ensureTaskWorkRequest\(\{/);
  assert.match(intake, /agentId: result\.allocation\?\.agentId \?\? null/);
  assert.match(executionControl, /task:\$\{taskId\}:primary/);
  assert.match(executionControl, /Standing delegation permits ordinary Task execution/);
});

test("continuous supervision backfills legacy Tasks before authority decisions", () => {
  assert.match(taskSupervisor, /if \(!latestRequest\)/);
  assert.match(taskSupervisor, /ensureTaskWorkRequest\(\{/);
  assert.match(taskSupervisor, /executionRequestsCreated/);
  assert.match(taskSupervisor, /delegationDecision\(\{/);
});

test("Task execution lifecycle reaches running, blocked and James-verified completed states", () => {
  assert.match(intake, /markTaskExecutionRunning\(task\.id\)/);
  assert.match(intake, /markTaskExecutionBlocked\(task\.id/);
  assert.match(supervisionRoute, /markTaskExecutionCompleted\(taskId/);
  assert.match(supervisionRoute, /verifiedBy: "James Hermes"/);
  assert.match(executionControl, /advance\(\s*refreshed,\s*"completed",\s*"James independently verified the Task outcome"\s*\)/);
});

test("James review has evidence gate and automatic bounded rework", () => {
  assert.match(supervisionRoute, /MAX_AUTOMATIC_REWORKS = 3/);
  assert.match(supervisionRoute, /requestedDecision === "VERIFIED_COMPLETE" && evidence\.length === 0 \? "REWORK_REQUIRED"/);
  assert.match(supervisionRoute, /dispatchRework\(task/);
  assert.match(supervisionRoute, /Automatic James QA reached the \$\{MAX_AUTOMATIC_REWORKS\}-cycle safety limit/);
});

test("James QA reports are correlated with the active review job", () => {
  assert.match(supervision, /activeReviewFile/);
  assert.match(supervision, /isActiveJamesReviewJob/);
  assert.match(supervisionRoute, /staleReviewIgnored/);
  assert.match(supervisionRoute, /clearActiveJamesReviewJob/);
});

test("James review failure can never silently complete a task", () => {
  assert.match(supervisionRoute, /exitCode !== 0/);
  assert.match(supervisionRoute, /status: "blocked"/);
  assert.match(supervisionRoute, /The task was not marked complete/);
});

test("malformed owner-review escalation is surfaced safely instead of stranding completion_pending", () => {
  assert.match(supervisionRoute, /escalatedOwnerReview && !reviewReason/);
  assert.match(supervisionRoute, /INVALID_REVIEW_OUTPUT/);
  assert.match(supervisionRoute, /requested owner review without a factual reason/);
});

test("owner review remains separate from James QA", () => {
  assert.match(supervisionRoute, /task\.ownerReviewRequired/);
  assert.match(supervisionRoute, /escalatedOwnerReview/);
  assert.match(supervisionRoute, /OWNER REVIEW REQUIRED/);
});

test("role and task scoped playbooks replace blanket context injection", () => {
  assert.match(intake, /Role\/task scoped playbooks/);
  assert.match(intake, /selected = scored\.filter\(item => item\.score > 0\)\.slice\(0, 4\)/);
});

test("dedicated detached James review runner reports a machine-readable decision", () => {
  assert.match(runner, /MISSION_CONTROL_REVIEW: VERIFIED_COMPLETE or REWORK_REQUIRED/);
  assert.match(runner, /MISSION_CONTROL_EVIDENCE_JSON/);
  assert.match(runner, /\/api\/james\/completion-review-report/);
  assert.match(routeIndex, /workerSupervisionRouter/);
});
