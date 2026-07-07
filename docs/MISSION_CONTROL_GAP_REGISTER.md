# Mission Control gap register

This register is prioritized from production/runtime risk to future architecture maturity.

## Critical gaps

### 1. Deployment/runtime source of truth is incomplete

- Repo does not contain the systemd unit, nginx config, or environment file used by production.
- Known production service is `ai-mission-control-api.service`, but exact `WorkingDirectory`, `EnvironmentFile`, `PORT`, and `DATABASE_URL` source must be verified on-host.
- Repo does not prove whether nginx serves frontend assets or proxies everything to Node.
- There is no committed one-command deploy script.

Recommended next patch: add a safe `scripts/deploy-mission-control.sh` after confirming host service details, with clean-tree check, fast-forward pull, pnpm install, build, tests/smoke, restart, status, and logs.

### 2. Frontend/backend production connection is ambiguous

- Vite builds frontend assets to `artifacts/mission-control/dist/public`.
- API server does not serve those assets.
- No nginx/static hosting config is committed.

Recommended next patch: document or commit deployment-owned nginx/static hosting config if it belongs in this repo; otherwise add a host-only operations note generated from `systemctl cat` and `nginx -T`.

### 3. `scripts/post-merge.sh` appears broken/suspect

- It runs `pnpm --filter db push`.
- The database package is named `@workspace/db`.
- `lib/db/package.json` does not define a `push` script.

Recommended next patch: either remove it from deployment guidance or replace it with an explicitly validated command. Do not run schema pushes without explicit approval.

### 4. Task/database write errors need live verification

- Task creation and other CRUD routes are database-backed and require schema alignment with production.
- No migration history/runbook is present.
- If production tables differ from Drizzle schema, runtime failures are likely.

Recommended next patch: add read-only schema diagnostics or a documented `drizzle-kit` inspection flow. Do not alter production tables without explicit approval.

## High-priority gaps

### 5. Agent abstraction remains partly hardcoded

- Current operational agents are hardcoded in `config-operational-agents.ts`.
- Current orchestrator is hardcoded as `James`.
- Assigned skills are name-based static mappings.
- Task UI contains James-oriented assignee/options and prompt text.

Recommended next patch: introduce a read-only capability/assignment view derived from existing agent records before changing write behavior.

### 6. Skills system has two sync implementations

- Runtime API sync uses git clone/fetch in `artifacts/api-server/src/services/skills.ts`.
- `scripts/sync-external-skills.mjs` uses GitHub HTTP APIs and a different source registry.
- This can confuse operators about which source of truth is authoritative.

Recommended next patch: choose and document one authoritative sync path; keep the other as deprecated or remove after confirmation.

### 7. Skills persistence is filesystem-based, not database-backed

- Skill source statuses are persisted in `.skill-source-status.json` under the skills root.
- Imported skills are files under `skills/external`.
- This is auditable and simple, but not tied to database backups unless the skills directory is backed up.

Recommended next patch: document backup requirements or add read-only diagnostics for skills root/cache/status file.

### 8. Audit trail is partial

- Agent dispatch/token actions have audit hooks.
- General CRUD routes for tasks, content, contacts, events, tools, integrations, and memories are not uniformly audited.
- Routing decisions are not first-class records.

Recommended next patch: define audit requirements before adding behavior; start with additive audit records only.

## Medium-priority gaps

### 9. Orca-style workspace support is partial

- Worktree/repository diagnostics and metadata exist.
- General PTY sessions, terminal streaming, launcher registry, durable CLI session logs, and provider task imports are missing.

Recommended next patch: add documentation and read-only discovery before implementing launchers.

### 10. Tool/integration permissions need stronger policy semantics

- Tool and integration grants exist.
- Permission checks are not yet a generalized router policy engine.

Recommended next patch: model capability and permission metadata without granting additional access by default.

### 11. Memory access is not scoped enough for multi-agent operation

- Memories are shared rows with category/preview/content.
- Agent reports can create memory.
- There is no explicit per-agent memory read/write policy.

Recommended next patch: add read-only policy documentation and later additive policy tables if approved.

### 12. UI contains hardcoded/fake-looking operational values

Examples found during audit:

- Dashboard labels James as the current orchestrator and agents-online value is static.
- Team page includes static agent display data in addition to API-backed records.
- Tasks page has static project/assignee choices including Hermes/James/Codex/Human.

Recommended next patch: replace hardcoded UI values with API-backed data only after confirming no behavior regression. Until then, label static values as configuration/defaults, not live truth.

## Lower-priority gaps

### 13. OpenAPI/client regeneration flow is not documented here

- API specs and generated clients exist.
- The command sequence for regenerating them is not part of the deployment runbook.

Recommended next patch: add an API contract maintenance doc.

### 14. No Docker/PM2 config, but operators may still ask about them

- Repo contains no Docker or PM2 deployment artifacts.
- Runbook should continue to state that systemd/Node is the current runtime unless host evidence changes.

### 15. Nginx route ownership unclear

- CORS allows `https://mission.customli.io`.
- Actual nginx routing is host state, not repo state.

Recommended next patch: capture sanitized nginx route details from production into deployment documentation if allowed.


### 16. Goose runtime support is an opportunity, but not yet implemented

- Goose appears suitable as an optional pluggable agent runtime for research, code, repo, MCP, and workflow execution.
- It should not replace Mission Control or Hermes; it should sit behind the same generic runtime adapter concepts as Hermes, Codex, Gemini, OpenCore, and future agents.
- Primary risks are unrestricted shell/file access, MCP extension side effects, shared user-level config/secrets, Goose-owned scheduling bypassing Mission Control audit, and sensitive diagnostics/session exports.

Recommended next patch: add a disabled-by-default Goose adapter skeleton with runtime config types, read-only health checks, permission profile validation, extension allowlist validation, task-envelope rendering, and secret redaction tests. Do not install Goose, enable execution, alter Hermes/auth, or change production service runtime. See `docs/integrations/GOOSE_AGENT_RUNTIME_AUDIT.md`.

## Recommended next implementation patch

Implement only after host verification:

1. Add `scripts/deploy-mission-control.sh` with clean-tree protection, fast-forward pull, `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm run test:skills`, systemd restart, status, logs, and live health/skills checks.
2. Add a non-mutating `scripts/diagnose-runtime.sh` that prints `systemctl cat`, selected `systemctl show` properties, Node version, pnpm version, git HEAD, service status, and recent logs.
3. Do not touch auth, Hermes runtime, database schemas, or production service behavior.
