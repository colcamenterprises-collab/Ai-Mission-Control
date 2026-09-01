# Mission Control V1.0 — Route Inventory

**Status:** CURRENT  
**Reviewed:** 2026-09-01  
**Router sources:** `artifacts/mission-control/src/App.tsx`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*`

This inventory records route ownership and compatibility status. Unless stated otherwise, API routes below are mounted under `/api`.

## 1. Frontend routes

| Path | Surface | Classification | Notes |
|---|---|---|---|
| `/` | Dashboard | CURRENT | Canonical home. |
| `/dashboard` | Dashboard | CURRENT | Alternate explicit dashboard URL. |
| `/notes` | Notes / Inbox | CURRENT | Capture, review, promote/convert workflow. `?create=note` opens capture flow. |
| `/tasks` | Kanban V2 | CURRENT | Canonical owner work surface. `?create=note` is redirected to Notes. |
| `/content` | Content Pipeline | CURRENT | Content management surface. |
| `/calendar` | Redirect to `/tasks` | LEGACY | Old navigation URL; calendar page source remains in tree but the router no longer renders it. Event API remains current. |
| `/memory` | Knowledge | CURRENT | Memory/Knowledge UI. |
| `/workspaces` | Repositories | CURRENT | Git/worktree management. |
| `/reports` | Reports | CURRENT | Owner reporting surface. |
| `/approvals` | Redirect to `/tasks` | LEGACY | Owner task review/approval UX consolidated into Tasks. Execution approval API remains current. |
| `/brain/executions/:id` | Execution detail | CURRENT | Mission Brain execution view. |
| `/brain/executions` | Executions | CURRENT | Mission Brain execution list. |
| `/brain` | Mission Brain | CURRENT | Organisational/business hub. |
| `/executions/:id` | Execution detail | TRANSITIONAL/DUPLICATE | Direct route renders the same execution surface as Brain path. Retain until navigation/deep-link ownership is standardized. |
| `/executions` | Executions | TRANSITIONAL/DUPLICATE | Same surface as `/brain/executions`. |
| `/business` | Redirect to `/brain` | LEGACY | Prior Business route. |
| `/signals` | Signals | CURRENT | Intelligence/evidence surface. |
| `/client-pulse` | Client Pulse | CURRENT | Account/source health surface. |
| `/agent-operations` | Agent Operations | CURRENT | Worker health, queues and execution operations. |
| `/reports-summary` | Reports | LEGACY | Old reports alias; renders Reports. |
| `/team/manage` | Redirect to `/team` | LEGACY | Team management consolidated into unified Team modal flow. |
| `/team` | AI Team | CURRENT | Canonical employee management/chat/hire surface. |
| `/agent-creation` | Redirect to `/team?hire=1` | LEGACY | Old standalone hire route. |
| `/skills` | Playbooks / Skills | CURRENT | Shared capability library. |
| `/contacts` | Contacts | CURRENT | Contact records. |
| `/secrets` | Secrets | CURRENT | Owner secret/provisioning administration surface. |
| `/onboarding` | Onboarding | CURRENT | Setup/onboarding surface. |
| `/settings` | Settings | CURRENT | Tools/integrations/system settings. |
| fallback | Not Found | CURRENT | Unmatched frontend route. |

### Source files that are not proof of live routes

`src/pages` contains historical/reference components such as `calendar.tsx`, older task implementations and older standalone management pages. A source file is not a live route unless `App.tsx` renders it directly or a live component imports it. For example, `business-hub.tsx` remains current because `mission-brain.tsx` imports it.

## 2. API authentication/mount order

### Public before global admin auth

`GET /api/healthz`  
`GET /api/readyz`  
`GET /api/employee-avatars/<filename>` — read-only static avatar delivery.  
`GET /employee-avatars/<filename>` — LEGACY/local compatibility static mount outside `/api`.

### Explicit admin endpoints mounted before agent bridge

These are intentionally admin-protected before route-local agent Bearer authentication:

`POST /api/agents/:id/dispatch`  
`POST /api/agents/:id/token`  
`POST /api/agents/:id/test`  
`POST /api/agents/:id/test-task`

### Agent-token routes

Routes beginning `/api/agent/...` authenticate through the worker Bearer token and are mounted before global admin auth.

### Global admin routes

All remaining route modules are mounted after `requireAdminAuth`.

## 3. Health and dashboard

`GET /api/healthz` — liveness.  
`GET /api/readyz` — deep readiness.  
`GET /api/dashboard/summary` — aggregated owner dashboard counts.

## 4. Canonical task/project API

### Project records

`GET /api/projects`  
`POST /api/projects`

### Task list/detail and lifecycle

`GET /api/tasks`  
`GET /api/tasks/archived`  
`POST /api/tasks` — CURRENT canonical intake; intercepted by `orchestrator.ts` before the generic tasks router.  
`GET /api/tasks/:id`  
`GET /api/tasks/:id/details`  
`PATCH /api/tasks/:id`  
`DELETE /api/tasks/:id`  
`PATCH /api/tasks/:id/move`  
`POST /api/tasks/:id/messages`  
`POST /api/tasks/:id/approve`  
`POST /api/tasks/:id/request-changes`  
`POST /api/tasks/:id/accept`  
`POST /api/tasks/:id/orchestrator-completion-review`  
`POST /api/tasks/:id/archive`  
`POST /api/tasks/:id/restore`

### Task attachment storage

`POST /api/tasks/:id/attachments`  
`GET /api/tasks/:id/attachments/:storedName`  
`DELETE /api/tasks/:id/attachments/:storedName`

### Task compatibility interceptors

`GET /api/tasks` is intercepted first by `task-list-compat.ts` so current free-form workflow states are returned without the older generated response enum rejecting them. **TRANSITIONAL.**

`PATCH /api/tasks/:id/move` is intercepted first by `kanban-status-compat.ts` only when the requested status is `changes_required`; all other move requests pass to the canonical tasks router. **TRANSITIONAL.**

Removal condition for both: regenerate/fix OpenAPI + generated Zod/client workflow-state definitions, migrate consumers, and prove Kanban V2 regression tests pass without shims.

## 5. Orchestration, executions and approvals

`POST /api/orchestrator/intake` — canonical explicit orchestrator intake.  
`POST /api/tasks` — orchestration-owned canonical task creation interceptor.  
`POST /api/executions` — capability router first enriches/assigns when no explicit agent, then execution router creates governed work request.  
`GET /api/executions` — execution list/filter.  
`GET /api/executions/:id` — execution + transitions + approval + audit + selected instructions.  
`POST /api/executions/maintenance/expire-leases` — expire stale worker leases and safely retry eligible read-only requests.  
`GET /api/approvals` — pending execution approvals.  
`POST /api/approvals/:id/decision` — approve/reject/request_changes.

## 6. Agent work-request bridge — Bearer-token worker API

`POST /api/agent/work-requests/claim`  
`POST /api/agent/work-requests/:id/heartbeat`  
`POST /api/agent/work-requests/:id/progress`  
`POST /api/agent/work-requests/:id/complete`  
`POST /api/agent/work-requests/:id/fail`

These routes enforce worker identity, request ownership/lease and execution eligibility.

## 7. Agent capability/memory/report bridge — Bearer-token worker API

`GET /api/agent/skills`  
`GET /api/agent/skills/:id`  
`GET /api/agent/memories`  
`GET /api/agent/tools`  
`POST /api/agent/ping`  
`POST /api/agent/command/:id/ack`  
`POST /api/agent/report`

### Shadowed duplicate implementation

`agent-skills.ts` is mounted before `agent-bridge.ts` and owns `GET /agent/skills` and `GET /agent/skills/:id`. `agent-bridge.ts` still contains older duplicate handlers for the same methods/paths. In normal mount order those duplicate handlers are **DEAD/SHADOWED** because the earlier router responds without calling `next()`. They should be removed in a focused cleanup after regression coverage confirms no alternate mount consumes them.

## 8. Admin agent directory/control

`GET /api/agents`  
`POST /api/agents`  
`GET /api/agents/:id`  
`PATCH /api/agents/:id`  
`DELETE /api/agents/:id`  
`PUT /api/agents/:id/skills`  
`POST /api/agents/:id/dispatch`  
`POST /api/agents/:id/token`  
`POST /api/agents/:id/test`  
`POST /api/agents/:id/test-task`

Agent create/update currently contains a **TRANSITIONAL** workaround for an obsolete generated department enum by validating with the legacy `Operators` placeholder while persisting the actual non-empty business department.

## 9. James direct and detached runtime routes

### Direct/in-memory James integration

`GET /api/james/status`  
`POST /api/james/message`  
`POST /api/james/jobs`  
`GET /api/james/jobs`  
`GET /api/james/jobs/:jobId`  
`POST /api/james/jobs/:jobId/cancel`

The `/james/jobs` store is process-memory only and resets when the API process restarts. Classify as **TRANSITIONAL/LEGACY MVP** relative to durable/detached execution.

### Detached systemd James work

`POST /api/james/task-job`  
`POST /api/james/inbox-review`  
`POST /api/james/report`

### Supervisory QA

`POST /api/james/completion-review-report`

This is the current mandatory specialist-worker QA report path used by James supervision.

## 10. AI employee profile/factory/provisioning

### Employee factory

`GET /api/employee-factory/projects`  
`GET /api/employee-factory/profiles`  
`POST /api/employee-factory/avatar`  
`POST /api/employee-factory/hire`  
`PUT /api/employee-factory/agents/:id/profile`

Uploaded/stored legacy avatar references beginning `/employee-avatars/` or the previous `/api/employee-factory/avatar/` prefix are canonicalized to `/api/employee-avatars/`. Those old prefixes are **LEGACY data compatibility**.

### Structured portable employee definition

`GET /api/employee-factory/agents/:id/definition`  
`PUT /api/employee-factory/agents/:id/definition`  
`GET /api/employee-factory/agents/:id/export`

### Provisioning/runtime lifecycle

`GET /api/provisioning/overview`  
`POST /api/provisioning/secrets`  
`PATCH /api/provisioning/secrets/:id`  
`POST /api/provisioning/runtime-hosts`  
`POST /api/provisioning/templates`  
`POST /api/provisioning/employees`  
`POST /api/provisioning/agents/:id/runtime/:action` — supported actions: start, stop, restart, health, decommission.  
`GET /api/provisioning/agents/:id/secrets`

## 11. Notes / Inbox

`GET /api/inbox`  
`GET /api/inbox/unreviewed`  
`POST /api/inbox`  
`PATCH /api/inbox/:id`  
`POST /api/inbox/review-results`  
`POST /api/inbox/:id/archive`  
`POST /api/inbox/:id/promote-memory`  
`POST /api/inbox/:id/convert`

## 12. Knowledge / Memory

`GET /api/memories`  
`POST /api/memories/sync`  
`POST /api/memories`  
`GET /api/memories/:id`  
`PATCH /api/memories/:id`  
`DELETE /api/memories/:id`

Repository-doc and Agent OS synchronized records are protected from UI mutation; Obsidian-backed records can write through to the source note.

## 13. Skills / Playbooks

`GET /api/skills`  
`POST /api/skills/sync`  
`POST /api/skills/:id/status`  
`GET /api/skills/:id`

Agent-token skill routes are listed in section 7.

## 14. Repositories / worktrees

`GET /api/worktrees/repositories`  
`GET /api/worktrees/path-preview`  
`GET /api/worktrees/workspaces`  
`GET /api/worktrees/diagnostics`  
`GET /api/worktrees/repositories/:repoId/git`  
`POST /api/worktrees/create`  
`POST /api/worktrees/cleanup`  
`POST /api/worktrees/agents/launch`

## 15. Intelligence

`GET /api/signals`  
`POST /api/signals`  
`POST /api/signals/:id/convert-to-task`  
`GET /api/client-pulse`

## 16. Agent operations / owner brief / task-based automations

`GET /api/operations/agents`  
`GET /api/operations/brief`  
`GET /api/operations/automations`

The automations endpoint is a read model over canonical Tasks; it does not create a second scheduler.

## 17. Content

`GET /api/content/pipeline/summary`  
`GET /api/content`  
`POST /api/content`  
`GET /api/content/:id`  
`PATCH /api/content/:id`  
`DELETE /api/content/:id`  
`PATCH /api/content/:id/move`

## 18. Events

`GET /api/events/upcoming`  
`GET /api/events`  
`POST /api/events`  
`GET /api/events/:id`  
`PATCH /api/events/:id`  
`DELETE /api/events/:id`

The event API remains CURRENT even though `/calendar` is a legacy frontend redirect.

## 19. Contacts and activity

`GET /api/contacts`  
`POST /api/contacts`  
`GET /api/contacts/:id`  
`PATCH /api/contacts/:id`  
`DELETE /api/contacts/:id`  
`GET /api/activity`

## 20. Tools and integrations

### Tools

`GET /api/tools`  
`POST /api/tools`  
`PATCH /api/tools/:id`  
`DELETE /api/tools/:id`  
`GET /api/tools/:id/agents`  
`POST /api/tools/:id/agents`  
`DELETE /api/tools/:id/agents/:agentId`  
`GET /api/agents/:id/tools`

### Integrations

`GET /api/integrations`  
`POST /api/integrations`  
`GET /api/integrations/:id`  
`PATCH /api/integrations/:id`  
`DELETE /api/integrations/:id`  
`GET /api/integrations/:id/agents`  
`POST /api/integrations/:id/agents`  
`DELETE /api/integrations/:id/agents/:agentId`  
`GET /api/agents/:id/integrations`

## 21. Route ownership rules

1. `App.tsx` is authoritative for live frontend paths.
2. `routes/index.ts` mount order is semantically significant; an earlier router may deliberately intercept a path owned later by another module.
3. Compatibility interceptors must be documented with an explicit removal condition.
4. A page source file is not a supported route merely because it exists.
5. New frontend or API route patterns must be added here in the same PR. CI checks route-documentation coverage.
