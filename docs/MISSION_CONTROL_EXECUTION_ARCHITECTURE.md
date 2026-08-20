# Mission Control Execution Architecture

## Purpose and source of truth

Mission Control owns work identity, policy, approvals, execution state, and audit. Agents are replaceable workers; Hermes is one runtime adapter rather than a separate product. Canonical `tasks` remain unchanged. The additive `work_requests` control-plane table links a task to a durable, idempotent execution using a unique `execution_key`.

## Lifecycle

The enforced lifecycle is `draft → queued → awaiting_approval → approved → dispatched → acknowledged → running → completed`, with explicit blocked, failed, rejected, and cancelled terminal/exception paths. Every accepted transition is compare-and-set in the database, appended to `work_request_transitions`, and mirrored into redacted `audit_events`. Invalid or concurrent transitions fail; they never appear successful.

## Routing, permissions, and risk

Routing remains capability-oriented and records its reason on the request. A request that lacks an eligible worker remains unassigned; runtime names never create authority. Risk is an integer from 0 through 4. Levels 0–1 auto-execute, level 2 is policy evaluated, level 3 requires the owner absent explicit standing authority, and level 4 is denied. Repository, environment, tool, integration, and memory scopes belong in request requirements and must be evaluated before dispatch.

## Approval

`approvals` is the single approval source. It has a one-to-one binding to its request, preventing approval reuse. Decisions only succeed while both the approval is pending and its request is awaiting approval. Approve, reject, and request-changes decisions are durable and audited.

## Adapters and bridge

Provider HTTP details stay behind `agent-runtime.ts`. Worker polling authenticates the worker token and scopes commands to that worker. The durable execution key, compare-and-set transitions, and acknowledgement state prevent duplicate pickup. Side-effecting work must not be automatically retried unless the adapter proves an idempotency key is supported.

## Heartbeat, history, cost, and owner report

Worker health derives from the persisted heartbeat, never a label. Execution history stores runtime/provider/model, timestamps, results, errors, usage, and provider-reported cost. Null cost means `UNKNOWN`; Mission Control does not estimate it. Completed adapters must populate the structured result and owner-readable report. The report lists work, routing reason, policy, context/memory/skills/playbooks/tools/repositories, changes, verification, cost, blockers, next action, and any remaining approval.

Workers claim only requests explicitly assigned to their authenticated agent ID. A two-minute renewable lease establishes ownership. Progress, completion, and failure mutations verify both worker identity and lease ownership. Expired read-only requests may retry within their recorded attempt limit; side-effecting requests fail terminally and are never replayed automatically.

## Memory and skills

HOT context is request-scoped, WARM knowledge belongs in canonical Memory with additive `memory_metadata`, immutable `memory_revisions`, and explicit `memory_agent_grants`; COLD history is retained in execution/audit records. Adapters receive only explicitly permitted memory and the minimum relevant versioned skills/playbooks. `execution_instructions` records stable IDs, versions, provenance, and selection reasons. Reads, writes, and use are attributed without secret content.

## Automations and failure rules

Automations create ordinary work requests; they do not bypass policy. Read-only operations may use bounded retries. Writes require proven idempotency. Timeouts and partial results end in explicit failed or blocked states. Polling must be bounded and indexed by worker/state.

## Additive schema operation

Upstream sources are canonical tasks and authenticated worker reports. Run `pnpm db:ensure-operational-schema` to install/rebuild the derived control-plane structures. The command uses only `CREATE IF NOT EXISTS` and indexes for this feature, is idempotent, and never drops or rewrites canonical data. Rollback is application-code rollback; retain execution/audit tables for forensic history.

| Derived layer                                | Upstream source truth                                                    | Determinism and rebuild expectation                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Work requests, transitions, approvals, audit | Canonical tasks, owner decisions, authenticated worker lifecycle reports | Append-only identity/event history; reinstall is idempotent and duplicate execution keys are rejected.    |
| Agent execution scopes                       | Explicit owner grants                                                    | Exact grant rows only; no capability is inferred from names, roles, or providers.                         |
| Memory metadata, revisions, grants           | Canonical Memory plus attributed owner/worker writes                     | Every new write creates an immutable numbered revision; access defaults to owner-only or explicit grants. |
| Signals                                      | Configured source adapters with stored evidence                          | No generated sample rows; conversion is idempotent through the stored linked task ID.                     |
| Account health and sources                   | Configured account-source adapters                                       | Empty sources report `NOT_CONNECTED`; accounts without evidence report `NO_DATA`.                         |

The rebuild command is `pnpm db:ensure-operational-schema`. Operational event/history tables must be restored from backup rather than recomputed because authenticated external reports are themselves source evidence. Read-model summaries may be regenerated deterministically from those retained records.
