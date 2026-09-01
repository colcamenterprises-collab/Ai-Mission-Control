# Mission Control V1.0 — Legacy and Deprecation Register

**Reviewed:** 2026-09-01

This register distinguishes code that is old-but-required from code that is genuinely removable. Do not delete a TRANSITIONAL path merely because a newer implementation exists.

## Status definitions

| Status | Meaning |
|---|---|
| CURRENT | Canonical supported implementation. |
| TRANSITIONAL | Required compatibility/migration layer with a defined removal condition. |
| LEGACY | Retained for old links/data/clients; not canonical. |
| DEAD/SHADOWED | Superseded or unreachable under current mount/router ownership. Candidate for removal after regression verification. |
| UNKNOWN / VERIFY HOST | Repo cannot establish truth; verify production host before changing. |

## Frontend path register

| Item | Status | Reason / removal condition |
|---|---|---|
| `/calendar` → `/tasks` | LEGACY | Calendar is no longer a first-class owner route. Remove alias only when no bookmarks/navigation/external references require it. Event API is separate and CURRENT. |
| `src/pages/calendar.tsx` | DEAD CANDIDATE | Current `App.tsx` redirects `/calendar` and does not render this page. Remove only after import/reference test confirms no live component uses it. |
| `/approvals` → `/tasks` | LEGACY | Task review/owner actions consolidated into Kanban. Execution approvals remain a distinct API/control-plane concept. |
| `/business` → `/brain` | LEGACY | Mission Brain replaced old Business route. |
| `/reports-summary` | LEGACY | Alias to Reports. |
| `/team/manage` → `/team` | LEGACY | Team management moved into unified Team modal. |
| `/agent-creation` → `/team?hire=1` | LEGACY | Standalone hire route replaced by Team hire flow. |
| `/executions` and `/brain/executions` both rendering same surface | TRANSITIONAL/DUPLICATE | Standardize canonical deep-link location and then redirect/remove the duplicate path. |
| older `src/pages/tasks.tsx` beside `tasks-v2.tsx` | DEAD CANDIDATE | Kanban V2 owns `/tasks`; remove old page only after import/reference check and tests. |

`business-hub.tsx` is **not** dead: Mission Brain imports it.

## API compatibility register

### `task-list-compat.ts`

**Status:** TRANSITIONAL  
**Path:** `GET /api/tasks`

Reason: current task workflow supports values such as `completion_pending` and `changes_required`, while the older generated API response enum cannot represent all current persisted states. The compatibility reader returns canonical task records without allowing generated response validation to break the board.

**Removal condition:**

1. update OpenAPI workflow-state definitions;
2. regenerate Zod and React client artifacts;
3. update all affected consumers;
4. run Kanban/workflow tests with the shim removed;
5. prove no production task state is rejected.

### `kanban-status-compat.ts`

**Status:** TRANSITIONAL  
**Path:** `PATCH /api/tasks/:id/move` only for `changes_required`.

Reason: persisted task status accepts the current state but the generated `MoveTaskBody` enum predates it.

**Removal condition:** same contract regeneration sequence as above.

### Agent department placeholder

**Status:** TRANSITIONAL  
**Location:** `routes/agents.ts`

The generated agent validator retains an obsolete four-value department enum. Mission Control now supports real business departments such as Finance. The route temporarily validates with legacy placeholder `Operators` while persisting the real non-empty department.

**Removal condition:** expand/regenerate the contract, remove placeholder normalization and retain regression coverage for arbitrary business departments.

### Duplicate worker skill handlers in `agent-bridge.ts`

**Status:** DEAD/SHADOWED  
**Paths:** `GET /api/agent/skills`, `GET /api/agent/skills/:id`

`agent-skills.ts` is mounted before `agent-bridge.ts` and responds to these methods/paths. The older duplicate handlers in `agent-bridge.ts` are therefore not reached in normal API composition.

**Cleanup condition:** add/retain agent-token skill-route tests, then remove only the duplicate bridge handlers/imports. Do not remove `agent-skills.ts`.

## Avatar compatibility

| Item | Status | Notes |
|---|---|---|
| `/api/employee-avatars/*` | CURRENT | Public read-only browser-safe avatar path. |
| `/employee-avatars/*` | LEGACY | Local/development compatibility static mount. |
| stored `/api/employee-factory/avatar/*` avatar references | LEGACY DATA | Canonicalized when profiles are read/saved. |
| stored `/employee-avatars/*` references | LEGACY DATA | Canonicalized to `/api/employee-avatars/*`. |

Removal requires proving old persisted profile references have been migrated and no local/dev consumer depends on the alias.

## James execution paths

| Path/system | Status | Notes |
|---|---|---|
| `/api/james/status` | CURRENT SUPPORT | Direct runtime health visibility. |
| `/api/james/message` | CURRENT/UTILITY | Synchronous direct James invocation; not durable task execution. |
| `/api/james/jobs*` in-memory job map | TRANSITIONAL / LEGACY MVP | Jobs disappear on API restart. Prefer durable task/work-request and detached execution flows. |
| `/api/james/task-job` detached systemd job | CURRENT | Durable host-level James task execution. |
| `/api/james/inbox-review` | CURRENT | Detached Inbox review. |
| `/api/james/report` | CURRENT | Detached result callback. |
| `/api/james/completion-review-report` | CURRENT | Mandatory supervisory QA callback. |
| `/api/tasks/:id/orchestrator-completion-review` | TRANSITIONAL/DUPLICATE REVIEW PATH | Manual/general orchestrator verification remains available beside current James supervisor flow. Standardize only with explicit workflow migration. |

## Employee-profile compatibility

PR #134 introduced broad employee profile fields. PR #141 moved skills/tools/memory/knowledge to shared company infrastructure. PR #142 removed profile-owned scheduling.

The structured profile can still carry historical `tools`, `heartbeat` and `memory` fields for compatibility, but generated `TOOLS.md`, `HEARTBEAT.md` and `MEMORY.md` now state the current architecture rather than treating these fields as a second permission/scheduler/memory authority.

**Status:** TRANSITIONAL DATA COMPATIBILITY.  
Do not make these legacy fields executable again.

## Skills synchronization duplication

There are two historical mechanisms:

- runtime API/service synchronization in `artifacts/api-server/src/services/skills.ts`;
- `scripts/sync-external-skills.mjs`.

**Status:** TRANSITIONAL / NEEDS CONSOLIDATION.

The application service is the runtime path. The script should only remain where operationally justified. Before removal, verify deployment/runbook/cron usage on the production host.

## Documentation legacy

Top-level historical documents such as `docs/MISSION_CONTROL_SYSTEM_MAP.md` and the older gap/architecture documents predate multiple August 2026 architecture changes.

**Status:** LEGACY DOCUMENTATION.

They must not remain competing sources of truth. This V1.0 documentation set under `docs/mission-control/` is canonical. Historical top-level docs should either become short pointers to the canonical set or be removed once inbound references are verified.

## Host/runtime unknowns

The following must not be guessed from repo history:

- exact current systemd unit body/environment file;
- exact nginx static/proxy ownership;
- whether any host cron invokes old scripts;
- backup coverage for filesystem-backed attachments, avatars, skills state, Obsidian and detached job files.

**Status:** UNKNOWN / VERIFY HOST.

Any cleanup depending on these facts stops until the host is inspected read-only.

## Safe cleanup sequence

1. Fix API contract drift before deleting task compatibility routers.
2. Remove shadowed duplicate worker-skill handlers after route tests.
3. Remove unreachable frontend page files only after import/reference regression checks.
4. Consolidate skills synchronization only after checking host automation.
5. Standardize duplicate execution deep links.
6. Migrate legacy avatar/profile data before removing compatibility aliases.
7. Replace/remove stale documentation so Knowledge has one canonical architecture source.
