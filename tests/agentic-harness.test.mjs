import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const harness = await readFile(
  new URL(
    "../artifacts/api-server/src/services/agentic-harness.ts",
    import.meta.url,
  ),
  "utf8",
);
const execution = await readFile(
  new URL(
    "../artifacts/api-server/src/services/task-execution-control.ts",
    import.meta.url,
  ),
  "utf8",
);
const agents = await readFile(new URL("../AGENTS.md", import.meta.url), "utf8");
const docs = await readFile(
  new URL("../docs/mission-control/AGENTIC_OS_HARNESS.md", import.meta.url),
  "utf8",
);

test("canonical Work Requests receive an evidence-gated Agentic Harness contract", () => {
  assert.match(execution, /buildExecutionHarnessContract/);
  assert.match(execution, /withExecutionHarnessRequirements/);
  assert.match(harness, /completionPolicy: "evidence_gated"/);
  assert.match(harness, /minimumEvidence/);
  assert.match(harness, /expiresWithExecution: true/);
});

test("completion is centrally gated by deterministic evals", () => {
  assert.match(execution, /evaluateCompletionContract/);
  assert.match(execution, /if \(!evaluation\.passed\)[\s\S]{0,80}return/);
  assert.match(
    execution,
    /advance\([\s\S]{0,120}refreshed,[\s\S]{0,80}"completed",[\s\S]{0,120}"Agentic harness evals passed/,
  );
  for (const evalId of [
    "evidence_present",
    "completion_summary_present",
    "supervisor_verified",
    "no_unresolved_blockers",
    "protected_action_authorized",
  ]) {
    assert.match(harness, new RegExp(evalId));
  }
});

test("failed evals are retained as replay cases", () => {
  assert.match(harness, /failureReplayLog/);
  assert.match(harness, /if \(!params\.passed\)/);
  assert.match(harness, /replay\.slice\(-10\)/);
});

test("existing active executions self-migrate instead of being stranded", () => {
  assert.match(execution, /ensureHarnessOnRequest/);
  assert.match(
    execution,
    /if \(contractFromRequirements\(request\.requirements\)\) return request/,
  );
  assert.match(
    execution,
    /request = await ensureHarnessOnRequest\(request, task\)/,
  );
});

test("future agents receive an explicit immutable execution workflow", () => {
  assert.match(agents, /Agentic Harness — mandatory runtime model/);
  assert.match(
    agents,
    /Never weaken, bypass, delete or reinterpret a failed eval/,
  );
  assert.match(docs, /Adding a future agent/);
  assert.match(docs, /Specialist agent workflow/);
  assert.match(docs, /James Hermes workflow/);
});
