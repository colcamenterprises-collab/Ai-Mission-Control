# Mission Control Ground Zero — Operating Model

**Classification:** CURRENT  
**Effective:** 2026-09-01  
**Patch:** Ground Zero 1.0

## Operating invariant

An active Mission Control task must never be left without a management state. It must have one of:

1. active execution;
2. a concrete next action with a named owner; or
3. a factual owner-authority requirement.

A generic blocker, worker uncertainty, failed attempt, or request for clarification is not automatically an owner decision.

## James Hermes standing management responsibility

James is the current orchestrator. Inside the authority already granted by Mission Control execution policy, James owns forward progress. His responsibilities include:

- understanding the owner brief and intended outcome;
- selecting or correcting the execution plan;
- assigning/reassigning work;
- investigating ordinary blockers;
- obtaining available evidence before asking the owner factual questions;
- requesting precise rework from specialists;
- retrying or changing a reversible execution approach where policy permits;
- reviewing stale active work;
- preserving the independent completion QA requirement;
- escalating only genuine owner-authority decisions.

## Delegation boundary

The continuous supervisor does not invent a second approval policy. The existing work-request execution policy remains authoritative:

- `AUTO_EXECUTE` — Mission Control may continue automatically.
- `ORCHESTRATOR_APPROVAL` — James may decide and continue.
- `OWNER_APPROVAL` — the owner must decide.
- `DENIED` — the action may not be autonomously executed.

An explicit task-level `approvalRequired` flag also requires the owner. Where an execution request has no explicit approval decision, risk levels 0-1 remain automatic and risk level 2+ is handled conservatively until policy explicitly grants orchestrator authority.

## Continuous task supervision

The API process performs recurring supervision after startup. Default configuration:

- first supervision pass: 30 seconds after server start;
- recurring pass: every 5 minutes;
- running/in-progress stale threshold: 20 minutes;
- maximum automatic supervision attempts: 3.

Environment overrides:

- `MISSION_CONTROL_SUPERVISION_FIRST_RUN_MS`
- `MISSION_CONTROL_SUPERVISION_INTERVAL_MS`
- `MISSION_CONTROL_SUPERVISION_STALE_MINUTES`
- `MISSION_CONTROL_SUPERVISION_MAX_ATTEMPTS`

Backlog, Ready, Blocked and Changes Required work is eligible for immediate management review on a supervision pass. Running/In Progress work is reviewed when stale. Completion Pending remains owned by the independent completion-review path and Review remains an owner-review state.

## Durable supervision state

Tasks now persist:

- `next_action`
- `next_action_owner`
- `blocker`
- `owner_decision_reason`
- `last_orchestrator_review_at`
- `supervision_attempts`

These fields are management state, not a replacement for the work-request execution audit.

## Escalation contract

Owner escalation is valid when:

- execution policy says `OWNER_APPROVAL`;
- execution policy denies autonomous action;
- task is explicitly marked owner approval required;
- required owner-only access/credential is unavailable;
- James runtime itself is unavailable and automated management cannot run; or
- bounded delegated recovery has been exhausted.

The escalation must identify the exact reason and next action. "Agent is blocked" by itself is not a sufficient owner escalation.

## Completion remains independent

Patch 1.0 does not weaken completion controls. Worker completion still routes through:

`worker result -> completion_pending -> James independent QA -> verified completion or rework -> optional Owner Review -> Done`

The active-task supervisor is a forward-progress manager; it is not a completion bypass.
