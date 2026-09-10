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
const taskRunner = fs.readFileSync("scripts/run-james-task-job.sh", "utf8");
const deploy = fs.readFileSync("scripts/deploy-mission-control.sh", "utf8");
const routeIndex = fs.readFileSync("artifacts/api-server/src/routes/index.ts", "utf8");

test("normal specialist completion cannot self-certify Review or Done", () => { assert.match(intake, /status:\s*"completion_pending"/); assert.match(intake, /queueJamesCompletionReview\(task\.id, agent\.name/); });
test("task conversation follow-ups also enter mandatory James QA", () => { assert.match(tasks, /status:\s*"completion_pending"/); assert.match(tasks, /queueJamesCompletionReview\(task\.id, agent\.name/); });
test("detached James execution gets a separate fresh supervisory pass", () => { assert.match(jamesDetached, /if \(result === "COMPLETED"\)/); assert.match(jamesDetached, /queueJamesCompletionReview\(taskId, "James Hermes", body\)/); assert.match(supervision, /Perform a fresh verification pass even when James Hermes was also the executing worker/); });
test("Ground Zero canonical Task intake immediately creates an execution request", () => { assert.match(intake, /ensureTaskWorkRequest\(\{/); assert.match(executionControl, /task:\$\{taskId\}:primary/); });
test("continuous supervision backfills legacy Tasks", () => { assert.match(taskSupervisor, /ensureTaskWorkRequest\(\{/); assert.match(taskSupervisor, /executionRequestsCreated/); });
test("owner escalation is idempotent", () => { assert.match(taskSupervisor, /alreadyEscalated/); });

test("supervision circuit breaker recognizes auth, credits, quota and access failures", () => {
  assert.match(taskSupervisor, /CIRCUIT_BREAKER_PREFIX/);
  assert.match(taskSupervisor, /HTTP\\s\+401/);
  assert.match(taskSupervisor, /User not found/);
  assert.match(taskSupervisor, /HTTP\\s\+402/);
  assert.match(taskSupervisor, /credit limit/);
  assert.match(taskSupervisor, /quota exceeded/);
  assert.match(taskSupervisor, /provider_access/);
  assert.match(taskSupervisor, /recentHardRuntimeFailure/);
});

test("terminal supervision limit never resets retry counter", () => {
  assert.match(taskSupervisor, /openCircuitBreaker/);
  assert.match(taskSupervisor, /supervisionAttempts: maxAttempts\(\)/);
  assert.match(taskSupervisor, /isCircuitOpen\(task\)/);
  assert.match(taskSupervisor, /AUTOMATIC EXECUTION STOPPED/);
  assert.doesNotMatch(taskSupervisor, /Automatic supervision reached[\s\S]{0,700}supervisionAttempts:\s*0/);
});

test("James detached callback immediately opens circuit on hard runtime failure", () => {
  assert.match(jamesDetached, /HARD_FAILURES/);
  assert.match(jamesDetached, /HTTP\\s\+401/);
  assert.match(jamesDetached, /User not found/);
  assert.match(jamesDetached, /HTTP\\s\+402/);
  assert.match(jamesDetached, /circuitOpen: Boolean\(hard\)/);
  assert.match(jamesDetached, /AUTOMATIC EXECUTION STOPPED/);
  assert.match(jamesDetached, /blockerType: hard\?\.type/);
});

test("detached endpoint refuses to spend credits while circuit is open", () => {
  assert.match(jamesDetached, /task\.blocker\?\.startsWith\(CIRCUIT_BREAKER_PREFIX\)/);
  assert.match(jamesDetached, /res\.status\(409\)/);
  assert.match(jamesDetached, /explicit recovery is required before another AI call/);
});

test("detached runners have hard wall-clock timeout", () => {
  assert.match(taskRunner, /timeout/);
  assert.match(runner, /timeout/);
});

test("James detached task and QA runners load the real Hermes profile credentials", () => {
  for (const source of [taskRunner, runner]) {
    assert.match(source, /JAMES_PROFILE_DIR=.*\/root\/\.hermes\/profiles\/james-hermes/);
    assert.match(source, /JAMES_PROFILE_ENV/);
    assert.match(source, /\. "\$JAMES_PROFILE_ENV"/);
    assert.match(source, /OPENROUTER_API_KEY/);
  }
});

test("production deploy attaches the James profile env to the API service without printing secrets", () => {
  assert.match(deploy, /JAMES_PROFILE_ENV/);
  assert.match(deploy, /EnvironmentFile=%s/);
  assert.match(deploy, /james-profile-env\.conf/);
  assert.match(deploy, /OPENROUTER_API_KEY presence verified without printing the secret/);
});

test("Task execution lifecycle remains harness-gated", () => { assert.match(intake, /markTaskExecutionRunning\(task\.id\)/); assert.match(supervisionRoute, /markTaskExecutionCompleted\(taskId/); assert.match(supervisionRoute, /verifiedBy: "James Hermes"/); assert.match(executionControl, /if \(!evaluation\.passed\) return/); });
test("James review retains bounded QA rework", () => { assert.match(supervisionRoute, /MAX_AUTOMATIC_REWORKS = 3/); assert.match(supervisionRoute, /dispatchRework\(task/); });
test("James QA reports correlate active review job", () => { assert.match(supervision, /activeReviewFile/); assert.match(supervisionRoute, /staleReviewIgnored/); });
test("James review failure cannot silently complete", () => { assert.match(supervisionRoute, /exitCode !== 0/); assert.match(supervisionRoute, /status: "blocked"/); });
test("role and task scoped playbooks remain active", () => { assert.match(intake, /Role\/task scoped playbooks/); });
test("dedicated review runner reports machine-readable decision", () => { assert.match(runner, /MISSION_CONTROL_REVIEW: VERIFIED_COMPLETE or REWORK_REQUIRED/); assert.match(routeIndex, /workerSupervisionRouter/); });
