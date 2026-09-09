# Mission Control Agentic OS Harness

Status: production architecture contract
Version: 1.0

## Purpose
Mission Control is the deterministic operating layer around nondeterministic AI workers. Models, providers and individual agents may change; Mission Control owns the business rules that decide what may run and what counts as complete.

This document is written for James Hermes, every specialist employee, future agents, and engineers extending Mission Control.

## Canonical execution path

```text
Owner outcome
  ↓
Canonical Task
  ↓
Work Request + execution contract
  ↓
Approval / authority policy
  ↓
Scoped context + execution capabilities
  ↓
Specialist worker
  ↓
Provisional worker result
  ↓
James independent supervisory QA
  ↓
Deterministic harness evals
  ├─ FAIL → retain replay case → rework / new plan
  └─ PASS → completed / owner review when explicitly required
```

The invariant is simple: runtime success is not business completion.

## Source of truth
The durable execution record is `work_requests`.

For canonical Tasks, `work_requests.requirements.agenticHarness` contains:

```json
{
  "contract": {
    "version": "1.0",
    "completionPolicy": "evidence_gated",
    "minimumEvidence": 1,
    "requiredEvals": [
      "evidence_present",
      "completion_summary_present",
      "supervisor_verified",
      "no_unresolved_blockers"
    ],
    "capabilityScope": {
      "allowed": ["..."],
      "protected": ["..."],
      "expiresWithExecution": true
    },
    "failureReplay": {
      "enabled": true,
      "retainFailedEvaluations": true
    }
  }
}
```

The final `work_requests.result.agenticHarness` records whether the contract passed and the individual eval outcomes.

## Completion contract
A worker result is provisional. Final completion is routed through `markTaskExecutionCompleted()` in `artifacts/api-server/src/services/task-execution-control.ts`.

The completion gate is fail-closed: a Work Request cannot transition to `completed` until all required deterministic evals pass.

Current evals:

| Eval | Purpose |
| --- | --- |
| `evidence_present` | Prevent unsupported completion claims. Trivial acknowledgement tasks may require zero evidence. |
| `completion_summary_present` | Require a concise factual outcome. |
| `supervisor_verified` | Require independent supervisory verification before final completion. |
| `no_unresolved_blockers` | Prevent a task being marked complete while blockers remain. |
| `protected_action_authorized` | Ensure identified protected capability classes remain inside the approval control plane. |

Do not add an eval that depends on persuasive model prose when a deterministic check is possible.

## Capability scope
Tool availability is not authority.

The harness records capabilities for the current execution. Capabilities expire with the Work Request. Protected capability classes currently include production changes, destructive changes, financial commitments, security changes and consequential external commitments when the Task brief indicates them.

Mission Control approval policy remains authoritative. The harness adds a second completion-side control; it does not replace approval gates.

When adding integrations, prefer semantic tools such as `get_daily_sales`, `reconcile_shift`, `deploy_staging` or `verify_health` over unrestricted generic shell/database access. The narrow tool should enforce its own bounds wherever practical.

## Context discipline
Global operating rules come from root `AGENTS.md` and `CONTEXT.md`. Employment Packs define agent identity, role and authority. Task evidence belongs to the canonical Task/Work Request.

Workers should receive the minimum correct context for the execution. Do not dump unrelated company memory into a worker prompt. Future context builders should derive task-specific context from the Work Request contract, role, relevant playbooks and connected evidence sources.

## Failure replay
Failed completion evals are retained under `work_requests.requirements.agenticHarness.failureReplayLog` with:

- timestamp;
- Work Request ID;
- retry count;
- failed eval results;
- completion candidate that failed.

The log is capped to the most recent ten failures per Work Request to avoid unbounded growth.

A retained failure is a regression case. Before increasing autonomy or materially changing a model, prompt, skill, workflow or tool, verify that known failures no longer slip through the corresponding evals.

## Existing-task migration
This patch intentionally does not require a database migration. Existing active Work Requests are upgraded lazily when `ensureTaskWorkRequest()` touches them or immediately before final completion. This prevents deployment from stranding work already in progress.

## James Hermes workflow
James is the orchestrator and independent completion supervisor.

1. Preserve the owner brief as authoritative.
2. Route to the narrowest capable specialist.
3. Keep ordinary reversible decisions inside delegated authority.
4. Respect protected-action gates.
5. Treat the specialist result as unverified input.
6. Verify the outcome independently against evidence.
7. Return precise rework when the result is insufficient.
8. Do not force a pass by weakening the contract.
9. Escalate to Cameron only for genuine owner authority or judgement.
10. A task reaches Done only after the harness passes.

## Specialist agent workflow
Every specialist worker follows:

1. Read the Task outcome and relevant execution rules.
2. Load only role/task-relevant context and evidence.
3. Check whether an action is protected before executing it.
4. Perform the work using the narrowest suitable tools.
5. Verify material claims.
6. Report a concise summary, evidence and any blockers.
7. Treat the completion claim as provisional until James and the harness verify it.
8. If rework is returned, correct the specific failure rather than merely rewriting the answer.

## Adding a future agent
A new employee is not production-ready merely because a provider responds.

Minimum onboarding:

1. Create the employee record and Employment Pack.
2. Define role boundaries and protected actions.
3. Attach relevant skills/playbooks and only necessary connected systems.
4. Run Ground Zero/runtime certification.
5. Execute a real canonical Task through the full Work Request path.
6. Confirm the Task receives an Agentic Harness contract.
7. Confirm James supervisory QA runs.
8. Confirm a deliberately inadequate completion candidate cannot reach `completed`.
9. Confirm successful evidence-backed work can complete.
10. Increase autonomy only after observed reliability justifies it.

## Extending the harness
Primary implementation: `artifacts/api-server/src/services/agentic-harness.ts`.

When adding an eval:

1. Add a stable `HarnessEvalId`.
2. Make the test deterministic where possible.
3. Add it only to contracts where it is relevant.
4. Record a human-readable `detail` explaining pass/fail.
5. Add regression coverage.
6. Never silently convert a failed required eval into a warning.

When adding a capability:

1. Name the business action, not the provider primitive.
2. Decide whether it is ordinary or protected.
3. Bind protected capability execution to the existing approval policy.
4. Make the capability execution-scoped.
5. Add evidence that can prove the action actually happened.

## Architectural boundaries
The harness does not make the model the source of truth. It does not replace Mission Control approvals, Task state, Employment Packs, canonical Knowledge, audit logging, or connected-system evidence.

It exists to connect those systems into a deterministic execution contract so that AI workers can be increasingly autonomous without allowing autonomy to become unverifiable.
