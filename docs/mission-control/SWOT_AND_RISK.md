# Mission Control V1.0 — SWOT and Architectural Risk Review

**Reviewed:** 2026-09-01  
**Basis:** current repository implementation and recent merged architecture history through PR #145.

## Executive assessment

Mission Control V1.0 has moved beyond a dashboard prototype into a credible durable control plane: work can be captured, routed, governed, executed, supervised, audited and surfaced to an owner. The strongest architectural decisions are the separation of owner Tasks from execution audit, fail-closed worker routing, independent completion QA, synchronized repository Knowledge, and the move toward runtime-independent AI employees.

The main V1.0 risk is **architectural overlap from rapid evolution**. Several old contracts, routes and compatibility implementations still coexist with the current model. Most are manageable, but they must be deliberately retired rather than allowed to become permanent parallel systems.

# SWOT

## Strengths

### 1. Durable, auditable execution control plane

`work_requests`, transitions, approvals, instructions, eligibility, leases and audit events provide substantially stronger execution semantics than simply posting prompts to agents.

### 2. Worker self-report is not final truth

The `completion_pending → James QA → verified/rework → optional owner Review → Done` architecture reduces false completion and makes evidence part of the operating model.

### 3. Agent/runtime independence

The platform can employ different providers/runtimes without allowing a single agent’s workspace or personality to become the company source of truth.

### 4. Canonical Knowledge synchronization

Git documentation and Agent OS files flow automatically into Knowledge with provenance/versioning, while Obsidian remains a writable capture/knowledge source. This gives agents a durable organisational brain without duplicating documents manually.

### 5. Clearer scheduling ownership

Recent releases removed profile-owned automations. Recurrence now belongs to canonical Tasks, avoiding competing scheduling engines.

### 6. Stronger security primitives than early versions

Admin auth, agent Bearer tokens, encrypted credentials, masked hints, rate limits, audit logs, eligibility checks, protected Memory sources, bounded filesystem writes and readiness checks are all present.

### 7. Operational certification

Liveness/readiness are separated and CI/deploy gates test more than “the Node process started”. This is a major production-quality improvement.

### 8. Controlled code execution support

Worktree creation/cleanup, repository diagnostics and controlled worker launch establish a safer foundation for multi-agent code work.

## Weaknesses

### 1. OpenAPI/generated-client drift from real workflow — HIGH

Evidence:

- `task-list-compat.ts` bypasses an older generated response enum.
- `kanban-status-compat.ts` adds `changes_required` before the generated move contract understands it.
- `agents.ts` uses a legacy department placeholder because the generated enum is obsolete.

Impact: the “contract” is no longer fully authoritative. Compatibility code can multiply and generated clients may misrepresent production behavior.

**Remediation:** make contract regeneration a first-class gate; bring task states and department semantics current, regenerate Zod/client code, then delete compatibility shims.

### 2. Parallel work representations remain conceptually expensive — HIGH

Owner Tasks and durable execution Work Requests serve different valid purposes, but their linkage/state synchronization is complex. Some routes still directly update Task state while newer paths move through work requests and supervision.

Impact: state divergence, duplicated workflow logic and difficulty reasoning about “what is canonical” for a given transition.

**Remediation:** retain separate records but define one explicit state synchronization service/contract. New code should not independently invent task/execution transition rules.

### 3. Duplicate/shadowed route implementations — MEDIUM

`agent-skills.ts` and `agent-bridge.ts` both contain the same worker skill GET paths; mount order makes the latter shadowed.

Impact: maintainers may patch the wrong implementation; security behavior can diverge.

**Remediation:** remove the shadowed handlers after regression coverage.

### 4. Mixed persistence model lacks one backup contract — HIGH

PostgreSQL is durable, but attachments, avatars, Obsidian, skill source state, worktrees and detached James state are filesystem-backed; legacy James job state is memory-only.

Impact: a database backup alone does not constitute a Mission Control backup.

**Remediation:** document and automate backup/restore coverage for every durable filesystem root; explicitly exclude/recreate ephemeral worktree/job state.

### 5. James has multiple execution interfaces — MEDIUM/HIGH

Synchronous message, in-memory jobs, detached jobs, task execution and supervisory review all coexist.

Impact: unclear canonical path and restart semantics; easy to accidentally build new features on an MVP interface.

**Remediation:** designate direct message/status as utilities, detached/control-plane work as canonical, and phase out in-memory background jobs.

### 6. Historical source files/docs remain in tree — MEDIUM

The frontend contains old page implementations while top-level system docs describe older architecture.

Impact: agents/developers can mistake source presence for product support and retrieve stale Knowledge.

**Remediation:** remove verified-unreachable pages and replace/remove stale docs after inbound reference checks.

### 7. Some owner identity strings are hard-coded — LOW/MEDIUM

Task/report code still contains literal owner author names in several places.

Impact: reduces portability/multi-user readiness and can create inconsistent audit authorship.

**Remediation:** centralize owner identity/context rather than scattering literal strings.

## Opportunities

### 1. Make the execution contract the platform backbone

A single shared state-transition/synchronization library for Tasks + work requests + supervisor QA would remove a large class of drift bugs and make future agent runtimes easier to add.

### 2. Generate route/system maps automatically

Static extraction of frontend routes/API patterns can keep documentation structurally current. This review adds an initial CI guard; it can later generate a machine-readable architecture manifest.

### 3. Add a formal runtime-adapter interface

Hermes, OpenClaw, provider API and webhook workers currently converge through services but still contain runtime-specific branches. A typed adapter contract for health, dispatch, cancellation, evidence and capability discovery would simplify growth.

### 4. Add explicit provenance/evidence objects for task completion

The QA loop already requires factual evidence. Promoting evidence into a first-class schema rather than free-text task messages would enable reliable reporting and automated validation.

### 5. Create operational backup/restore certification

A recurring restore test covering DB + protected filesystem roots would substantially improve resilience.

### 6. Reduce owner UI complexity through canonical projections

Dashboard, Reports, Agent Operations, Client Pulse and Mission Brain can increasingly become read models over canonical Tasks/Executions/Signals rather than accumulating separate mutation logic.

### 7. Major-release architecture certification

At V2.0+ releases, automatically produce a route/schema diff and require the generic agent overview + architecture docs to be reviewed before release.

## Threats

### 1. Compatibility layers becoming permanent

Rapid feature delivery can make shims the easiest place to add the next state. If contract regeneration is not enforced, the old generated contract becomes ceremonial.

### 2. Runtime coupling to one worker

James is valuable, but if new orchestration logic is implemented only in James-specific endpoints/scripts, replacing or supplementing James becomes expensive.

### 3. Secret/permission model fragmentation

Tools, integrations, provisioning secrets and agent execution scopes are separate legitimate domains. Without a unified policy vocabulary, future features could grant equivalent access through different stores.

### 4. Filesystem loss or host drift

Operational truth extends beyond PostgreSQL. Host-level state loss, permissions changes or untracked systemd/nginx drift can break otherwise green application code.

### 5. Over-automation of consequential actions

The system increasingly routes and executes automatically. Any regression that bypasses eligibility, approval or supervisor verification could have real-world effects.

### 6. Knowledge pollution

If stale/duplicate repository docs remain in `docs/`, Memory Sync will faithfully index them. Agents can then retrieve contradictory architecture documents.

# Prioritized risk register

| Priority | Risk | Current control | Required action |
|---|---|---|---|
| P0 | Generated API contract differs from production workflow | Compatibility interceptors and regression tests | Update OpenAPI task states/department model, regenerate clients, remove shims only after green tests. |
| P0 | Unsafe/fake completion | `completion_pending`, James evidence QA, owner Review separation | Preserve invariant; centralize transition logic and add evidence schema. |
| P0 | Credential or protected-action bypass | Admin/agent auth, encryption, eligibility, approvals, audit | Keep permission tests mandatory; converge policy semantics across tools/integrations/provisioning. |
| P1 | Task/work-request state divergence | Transition service + several synchronization points | Define one synchronization contract/service and prohibit ad-hoc cross-model transitions. |
| P1 | Incomplete backup coverage | DB durability; filesystem locations are known | Build backup inventory and restore test for attachments, avatars, Obsidian, skills/provisioning state as applicable. |
| P1 | Stale docs pollute Knowledge | Protected source sync + Git provenance | Make `docs/mission-control` canonical; retire outdated competing docs. |
| P1 | James-specific orchestration coupling | Generic agent runtime service exists | Formalize runtime adapter interface; keep supervision policy in Mission Control services. |
| P2 | Duplicate/shadowed endpoints | Mount order currently protects canonical handler | Remove duplicate worker skill handlers with tests. |
| P2 | Duplicate frontend/deep-link paths | Redirects preserve old links | Standardize canonical execution route and remove unreachable page sources. |
| P2 | Hard-coded owner identity | Single-owner deployment masks issue | Centralize configured owner identity before multi-user expansion. |
| P2 | Host configuration not represented in repo | Readiness/smoke checks | Document verified systemd/nginx/env/backup runbook or manage it as code. |

# V1.0 cleanup decisions from this review

Safe conclusion does **not** mean “delete everything labelled legacy”. Current priorities are:

1. Stop stale documentation being treated as current architecture.
2. Add CI route/documentation drift protection.
3. Record exact removal conditions for compatibility paths.
4. Fix API-contract drift before removing task shims.
5. Remove only verified shadowed/unreachable code in focused regression-backed patches.
6. Verify host-owned state before changing scripts or filesystem integrations that may have external automation consumers.

This approach cleans Mission Control without trading architectural neatness for production breakage.
