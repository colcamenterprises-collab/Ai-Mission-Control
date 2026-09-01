# Mission Control V1.0 — System Architecture

**Classification:** CURRENT  
**Reviewed:** 2026-09-01  
**Baseline:** `main` at `b55101db34a4fa2502dd70cf1a8cd3fd0b5b0683`

## 1. What Mission Control is

Mission Control is a business operating system and agent-agnostic orchestration layer. It owns durable work identity, owner-facing tasks, routing, policy, approvals, execution state, audit, organisational knowledge, skills/playbooks, AI employee records, runtime provisioning metadata and operational visibility.

Workers are replaceable. James Hermes is presently an important orchestrator/supervisor/runtime integration, and OpenClaw is an automatically provisionable employee runtime, but neither is the platform core.

The architecture deliberately separates:

1. **Owner operating surfaces** — dashboard, Kanban/tasks, notes, Mission Brain, Team, Knowledge, Playbooks, repositories, reports and settings.
2. **Control plane** — task intake, capability routing, `work_requests`, approvals, leases, state transitions and audit.
3. **Worker plane** — agent bridge, provider/webhook runtimes, James detached jobs, OpenClaw runtime instances and future adapters.
4. **Knowledge plane** — repository docs, Agent OS documents, Obsidian notes, database Memory/Knowledge records and revisions.
5. **Infrastructure plane** — PostgreSQL/Drizzle, filesystem state, Git/worktrees, Node/systemd runtime and external providers.

## 2. Repository topology

Mission Control is a pnpm workspace/monorepo.

| Path | Responsibility |
|---|---|
| `artifacts/mission-control` | React/Vite owner-facing web application. |
| `artifacts/api-server` | Express API server, orchestration endpoints and production Node entrypoint. |
| `lib/db` | PostgreSQL/Drizzle client, schemas and operational schema support. |
| `lib/api-spec` | OpenAPI contract. |
| `lib/api-zod` | Generated API request/response validation. |
| `lib/api-client-react` | Generated frontend API client/types. |
| `agents` | Portable agent roles/profiles and agent-oriented Markdown. |
| `agent-os` | Product mission, standards, specs and process documentation. |
| `skills` | Local and synchronized skill/playbook library. |
| `docs` | Repository documentation; also an automatic Knowledge source. |
| `scripts` | Deployment, smoke, synchronization, detached worker and maintenance scripts. |
| `tests` | Workflow, execution, readiness, UI-surface and architecture regression tests. |
| `.github/workflows` | CI release gates. |

Root package scripts make pnpm mandatory. Production validation currently includes workflow tests, execution-policy tests, operational-schema tests, skills tests, recursive typechecking and production build.

## 3. Runtime topology

### Frontend

- Entry/router: `artifacts/mission-control/src/App.tsx`.
- Framework: React + Vite.
- Router: Wouter.
- Server state: TanStack Query.
- Kanban drag/drop: dnd-kit.
- Build output: Vite-owned frontend assets.
- `BASE_PATH` controls the frontend/router base.

### API

- Source entrypoint: `artifacts/api-server/src/index.ts`.
- Express composition: `artifacts/api-server/src/app.ts`.
- Main router: `artifacts/api-server/src/routes/index.ts` mounted at `/api`.
- Production process is Node. Known production service is `ai-mission-control-api.service` from prior server verification.
- `PORT` and `DATABASE_URL` are fundamental runtime inputs.

### Host-owned boundary

The repository does not, by itself, prove every production nginx/systemd/environment detail. Host configuration must be verified before changing deployment routing. This is **UNKNOWN / VERIFY HOST**, not permission to infer configuration.

## 4. Request/authentication boundary

`app.ts` establishes:

- HTTP request logging with pino.
- CORS allowlist including `https://mission.customli.io` and development origins, extendable through `MISSION_CONTROL_ALLOWED_ORIGINS`.
- Public read-only employee avatar delivery before admin auth.
- JSON and URL-encoded request parsing.
- `/api` router mounting.

The API has three authentication classes:

### Public liveness/readiness

- `GET /api/healthz`
- `GET /api/readyz`
- read-only employee avatar static files under `/api/employee-avatars/*`.

### Agent-token routes

Agent bridge endpoints authenticate their own Bearer token through `getAgentFromBearer`. They are mounted before global admin authentication. They cover worker skills, memory grants, work-request claim/heartbeat/progress/completion/failure, ping, command acknowledgement, reporting and granted-tool discovery.

### Admin routes

Admin control routes are protected by Mission Control admin auth. Four agent control endpoints are explicitly admin-gated before the agent bridge is mounted:

- `POST /api/agents/:id/dispatch`
- `POST /api/agents/:id/token`
- `POST /api/agents/:id/test`
- `POST /api/agents/:id/test-task`

All subsequent owner/control-plane routers are mounted after global `requireAdminAuth`.

## 5. Owner-facing application map

Canonical navigation is intentionally smaller than the number of source files in `src/pages`.

Primary current surfaces are:

- Dashboard — operating summary and recent activity.
- Tasks — Kanban V2 and the main owner work surface.
- Notes — capture/inbox and promotion into tasks or Knowledge.
- Mission Brain — organisational hub, business/project context and execution access.
- Knowledge — database Memory/Knowledge plus synchronized source documents.
- Repositories — configured Git/worktree operations.
- Reports — owner reporting/operations views.
- Team — unified AI employee management, profile management and chat/hire flows.
- Playbooks/Skills — shared company capability library.
- Contacts.
- Settings — tools/integrations and system administration.
- Signals / Client Pulse / Agent Operations — intelligence and operational observability surfaces.

Legacy URLs are redirected instead of being treated as separate product areas. Exact route ownership is in `ROUTES.md`.

## 6. Work architecture: Tasks vs execution control plane

Mission Control currently has two related durable work representations, plus compatibility bridges. This is intentional history that must remain explicit.

### A. Owner Tasks/Kanban

`tasks` are the canonical owner-facing work item. They contain the human brief, project, assignee, priority, status, due/recurrence information, attachments, task conversation, report and archive state.

Canonical task creation is intercepted by `orchestrator.ts` **before** the general tasks router. `POST /api/tasks` therefore cannot bypass orchestration intake.

The current owner workflow uses states including:

- backlog/ready/running style active states
- `changes_required`
- `blocked`
- `completion_pending`
- `review`
- `done`
- archive is represented separately with `archivedAt`

A worker saying “complete” is not sufficient for Done.

### B. Durable `work_requests` execution control plane

`work_requests` represent governed execution. They provide:

- unique `execution_key` for idempotency
- task linkage
- selected agent
- business/project/repository/environment context
- requested action and requirements
- risk level and approval decision
- routing reason
- state machine and transition history
- claim/lease ownership
- progress/result/error
- usage and provider-cost metadata
- owner report
- selected execution instructions/playbooks

The enforced lifecycle includes:

`draft → queued → awaiting_approval/approved → dispatched → acknowledged → running → completed`

with `blocked`, `failed`, `rejected`, cancellation/exception handling and safe retry behavior where policy permits.

### C. Relationship

Tasks answer: **What business work does the owner want and what is its visible status?**

Work requests answer: **What governed execution happened, who was allowed to do it, under what policy/approval, and what evidence/audit state resulted?**

The architecture is not yet fully collapsed into one record type. Any future consolidation must preserve both the owner work history and the execution audit/control semantics.

## 7. Orchestration and capability routing

`orchestrator.ts` owns canonical task intake. It:

1. normalizes an owner brief;
2. derives or accepts requested capabilities;
3. respects an explicitly requested agent when supplied;
4. otherwise resolves a capable agent and selected skills;
5. calls durable orchestration intake;
6. persists routing context with the resulting command/allocation.

`capability-routing.ts` also intercepts `POST /api/executions` before the execution router. When no explicit `agentId` exists, it resolves capabilities and injects routing reason, selected worker requirements and selected skill instructions.

Routing must fail closed rather than fabricate worker availability.

## 8. Completion, QA and owner review

PR #145 established the current supervisory model:

1. Specialist worker executes.
2. Worker success moves the owner task to `completion_pending`.
3. James Hermes receives an independent supervisory completion review.
4. James returns either `VERIFIED_COMPLETE` with factual evidence or `REWORK_REQUIRED`.
5. Rework is automatically returned to the specialist worker, up to a three-cycle safety limit.
6. Verified work may route directly to Done or to owner Review depending on the task/verification policy.
7. Owner acceptance is a distinct action and is only valid from Review.

This is a critical safety property: worker self-reporting cannot directly manufacture owner-visible completion.

There is also an older/manual `POST /api/tasks/:id/orchestrator-completion-review` endpoint. The newer James supervisory report path is `POST /api/james/completion-review-report`. Both must be documented until one is deliberately retired.

## 9. James Hermes integration

James currently appears in several roles, which must not be conflated:

- configured AI employee/orchestrator identity;
- direct runtime bridge via `/usr/local/bin/james-hermes`;
- in-memory legacy/MVP job API (`/api/james/jobs`);
- synchronous message API (`/api/james/message`);
- detached systemd task execution through `run-james-task-job.sh`;
- detached Inbox review;
- mandatory supervisory completion reviewer.

The direct job map in `james.ts` is process-memory only and resets when the API restarts. Detached systemd jobs are the more durable execution path. This split is a migration/legacy concern, not two equally canonical job systems.

## 10. AI employee model

AI employees are persisted in `agents` and related profile/runtime tables.

Current principles:

- an employee is a replaceable worker, not the organisation;
- status/current-task state is reconciled against durable work requests before agent reads;
- employee profile identity/soul/operating instructions are structured data;
- Markdown files such as `IDENTITY.md`, `SOUL.md`, `AGENTS.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `MEMORY.md` are generated projections for compatible runtimes;
- credentials are excluded from portable `.agent.json` exports;
- runtime workspace writes are limited to approved managed runtime roots;
- recurring duties/alerts are **not** an employee-owned scheduler; canonical Mission Control tasks own schedules/triggers;
- skills/tools/systems/shared memory are company infrastructure, not duplicated employee configuration.

OpenClaw is currently the automatic hiring/provisioning path. Hermes can be represented as a worker but automatic provisioning remains different.

## 11. Provisioning and runtime lifecycle

Provisioning persists:

- runtime hosts
- encrypted secret vault entries and hints
- employee templates
- runtime instances
- agent secret grants

Provisioning endpoints support secret creation/update, runtime-host creation, template creation, employee provisioning, runtime start/stop/restart/health/decommission and agent secret-grant inspection.

OpenClaw provisioning was hardened in PRs #126–#129. The shared OpenClaw gateway is a host-level dependency; employee provisioning must not try to install/restart the shared gateway from Mission Control’s system-service context.

## 12. Knowledge, Memory, Notes and Obsidian

### Repository/Knowledge synchronization

`memory-sync.ts` scans Markdown under:

- `<repo>/docs` → `repo-docs:` → category `knowledge`
- `<repo>/agent-os` → `agent-os:` → category `processes`
- configured Obsidian vault → `obsidian:` → category `knowledge`

Each source document is represented in the database with metadata and revisions. Source-document updates create new revisions rather than duplicate knowledge rows.

Repository and Agent OS records are protected in the Knowledge API: they cannot be modified or deleted through the UI. The source file must be changed in Git.

### Obsidian

Default vault path is `/opt/mission-control-vault` unless overridden. Obsidian-backed Knowledge records can write through to their Markdown source on edit/delete.

### Notes/Inbox

The Inbox/Notes layer accepts typed, voice-transcript, imported or agent notes; synchronizes with Obsidian; supports factual orchestrator review; and can promote a note into durable Memory/Knowledge or convert it into a canonical task.

This produces a clean information lifecycle:

`capture → review → promote to Knowledge OR convert to Task → archive`

## 13. Skills and playbooks

Mission Control exposes a shared company skill library.

Sources include:

- repository-local skills;
- synchronized external skill sources;
- shared/vault skills with statuses such as proposed, needs-review, approved and deprecated.

Owner/admin APIs can list, sync, read and set shared-skill status. Agent-token APIs expose approved/shared capabilities to authenticated workers without returning unrelated credentials.

A historical second synchronization script still exists alongside the runtime skill service. The runtime service is the canonical application path; the duplicated script path must remain classified until deliberately retired.

## 14. Repositories and worktrees

The repository/worktree layer provides:

- configured repository discovery
- safe worktree path preview
- Orca-style workspace metadata
- Git/worktree diagnostics
- Git status/worktree availability inspection
- task worktree create/cleanup
- controlled workspace-agent launch

Safety/permit/dry-run/permission-mode controls are part of the worktree API. This is not yet a general terminal/PTY orchestration platform.

## 15. Intelligence and operations

### Signals

Signals are evidence-bearing detected items with business/project/severity/urgency/actionability metadata. A signal can be converted atomically to a task with duplicate protection.

### Client Pulse

Client Pulse aggregates account sources and account-health state and reports whether any source is connected.

### Agent Operations

Operations endpoints aggregate agent health, current work, queue depth, approvals, failures, usage and execution scopes. Health is derived from persisted status, heartbeat age and work-request state.

### Daily/owner brief

The operations brief assembles needs-you approvals, running work, blocked work, priorities, recently shipped work, risks/signals, upcoming items and one data-supported recommended next action.

### Automations

The operations automation view is a projection of canonical tasks with due dates/recurrence. It is **not** a separate scheduler.

## 16. Supporting business data modules

- **Content** — database-backed content pipeline CRUD and stage moves.
- **Events** — database-backed events and upcoming-window query. The frontend `/calendar` page route is now a legacy redirect to Tasks even though the event API remains live.
- **Contacts** — database-backed contact CRUD/search.
- **Activity** — recent activity feed.
- **Tools** — encrypted credential/tool registry plus per-agent access relationships.
- **Integrations** — encrypted external integration registry plus per-agent assignments.
- **Dashboard** — aggregates task, content, event, agent and activity counts.

## 17. Data/state model

Mission Control uses PostgreSQL through Drizzle. Schema modules currently cover at least:

- tasks/projects/task messages/task archives
- content
- events
- memories, metadata, revisions and grants
- agents and commands
- tools/tool access
- integrations/agent integrations
- work requests, transitions, approvals, audit events and execution instructions/scopes
- Inbox/Notes
- signals/account sources/account health
- provisioning/runtime hosts/secrets/templates/runtime instances/secret grants
- activity

Not all state is PostgreSQL-backed:

- uploaded task attachments are filesystem-backed;
- employee avatar files are filesystem-backed;
- skill source cache/status uses filesystem state;
- worktree metadata and Git worktrees are filesystem/Git state;
- Obsidian is a filesystem knowledge source;
- legacy `james.ts` background jobs are in-memory only;
- detached James jobs use host systemd plus `/var/lib/ai-mission-control/james-jobs` state.

This mixed persistence model makes backup/runbook clarity important.

## 18. Security controls observed in repo

Positive controls include:

- global admin authentication for owner/control routes;
- agent-scoped Bearer token authentication;
- rate limiting on sensitive write/agent endpoints;
- encrypted stored credentials and masked response hints;
- audit logging for many credential/agent/provisioning operations;
- redaction of execution requirements/results/audit payloads;
- scoped worker leases and explicit ownership checks;
- explicit eligibility checks before execution/memory access;
- protected source-document Knowledge records;
- approved managed workspace roots for agent-profile writes;
- task attachment executable-extension blocklist and size cap;
- deep readiness separate from cheap process liveness.

Remaining risks and inconsistencies are detailed in `SWOT_AND_RISK.md`.

## 19. Deployment and readiness

PR #136 added operational certification. The current design distinguishes:

- `/api/healthz` — cheap Node-process liveness;
- `/api/readyz` — deep operational readiness covering critical dependencies.

Release gates include workflow, execution, schema, skills, typecheck and production build tests. A production deploy script exists in the repository in the current release lineage and should be the deployment entrypoint rather than ad-hoc commands.

Exact nginx/systemd/environment ownership remains host-verification territory where the repo does not contain authoritative files.

## 20. Architecture invariants

The following rules should be treated as V1.0 invariants:

1. Mission Control is the platform; no single agent/runtime is the platform.
2. Canonical business work is represented by Tasks.
3. Recurring work/schedules belong to Tasks, not employee profiles.
4. Governed execution is durable and auditable through the execution control plane.
5. A worker cannot self-promote work directly to final completion.
6. Protected actions require policy/approval; approval is not a generic error-recovery button.
7. Git-owned documentation remains canonical; Knowledge is a synchronized runtime projection.
8. Shared skills/knowledge/tools are company infrastructure; credentials remain centrally protected.
9. New routes/compatibility shims must be documented in the same PR.
10. Legacy paths are removed only after their consumer/data migration condition is satisfied and regression tests prove safety.
