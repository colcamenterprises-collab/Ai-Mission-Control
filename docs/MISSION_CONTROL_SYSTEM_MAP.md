# Mission Control system map

Mission Control is the agent-agnostic orchestration platform in this repository. James, Hermes, Codex, Gemini, OpenCore/OpenClaw, and future workers are agents or integrations that can be plugged into Mission Control; they are not the platform core.

## Repository and workspace layout

- Monorepo package manager: `pnpm`; the root `preinstall` script rejects other package managers.
- Root build: `pnpm run build`, which typechecks libs and artifacts, then runs package builds.
- Main packages:
  - `artifacts/api-server`: Express API server and production Node entrypoint.
  - `artifacts/mission-control`: React/Vite frontend dashboard.
  - `lib/db`: Drizzle/PostgreSQL schema and database client.
  - `lib/api-spec`: OpenAPI contract.
  - `lib/api-zod`: generated request/response validators.
  - `lib/api-client-react`: generated React/client fetch layer.
  - `scripts`: operational scripts.
  - `skills`: local bundled agent skills.

## Runtime entrypoints and build output

### API server

- Source entrypoint: `artifacts/api-server/src/index.ts`.
- Express app composition: `artifacts/api-server/src/app.ts`.
- API routes are mounted under `/api`.
- Production build script: `artifacts/api-server/build.mjs`.
- Production output: `artifacts/api-server/dist/index.mjs` plus sourcemap files.
- Package start command: `node --enable-source-maps ./dist/index.mjs` from `artifacts/api-server`.
- Known production systemd command from server context: `/root/.local/bin/node dist/index.mjs`.

### Frontend

- Frontend source root: `artifacts/mission-control/src`.
- Frontend app entry/router: `artifacts/mission-control/src/App.tsx`.
- Frontend Vite config: `artifacts/mission-control/vite.config.ts`.
- Frontend build output: `artifacts/mission-control/dist/public`.
- Vite is a build-time/dev server concern in this repo. The API server code does not serve `dist/public`; no static middleware is present in `artifacts/api-server/src/app.ts`.

## Environment variables used by repo code

Required by API server runtime:

- `PORT`: required by `artifacts/api-server/src/index.ts`; the server fails fast if absent or invalid.
- `DATABASE_URL`: required by `lib/db/src/index.ts`; the database client fails fast if absent.

API/server optional variables:

- `NODE_ENV`: production mode blocks wildcard CORS origins.
- `MISSION_CONTROL_ALLOWED_ORIGINS`: comma-separated extra CORS origins.
- `MISSION_CONTROL_ADMIN_TOKEN`: accepted admin bearer token.
- `VITE_MISSION_CONTROL_ADMIN_TOKEN`: fallback admin token source in API auth and smoke script.
- `MISSION_CONTROL_SKILLS_DIR`: overrides the skills root.
- `MISSION_CONTROL_SKILLS_CACHE_DIR`: overrides external skills git cache root.
- `MISSION_CONTROL_EXTERNAL_SKILL_SOURCES`: JSON registry overriding default external GitHub skill sources.
- `GITHUB_TOKEN`: optional token for authenticated GitHub/git access during skill sync. The git child process receives authentication through an extra header while the raw `GITHUB_TOKEN` is removed from the child environment.
- `MISSION_CONTROL_SMOKE_BASE_URL`, `MISSION_CONTROL_SMOKE_SEND_JAMES`: used by operational smoke checks.

Frontend build/dev required variables:

- `PORT`: required by Vite config for dev/preview server.
- `BASE_PATH`: required by Vite config and used as the React router base.
- `NODE_ENV`, `REPL_ID`: control Replit-only Vite plugins.

## Database layer

- Database library: Drizzle ORM using `drizzle-orm/node-postgres` and `pg`.
- Database connection: `new Pool({ connectionString: process.env.DATABASE_URL })`.
- Schema package: `lib/db/src/schema`.
- Current schema modules:
  - `tasks`: task board records.
  - `content`: content pipeline records.
  - `events`: calendar events.
  - `memories`: memory records.
  - `agents`: agent/team records.
  - `contacts`: contacts.
  - `activity`: activity/audit-style feed entries.
  - `integrations`: external integrations and agent assignments.
  - `agent-commands`: queued dispatch commands for agents.
  - `agent-tools`: tool registry and agent tool grants.

No migration/deploy runbook exists in this repo. `scripts/post-merge.sh` references `pnpm --filter db push`, but the actual package name is `@workspace/db`; treat that script as suspect until fixed.

## API route structure

All route paths below are mounted under `/api` by `artifacts/api-server/src/app.ts` and `artifacts/api-server/src/routes/index.ts`.

Unauthenticated/route-local auth:

- `GET /healthz`: health check.
- Agent bridge routes stay bearer-token gated inside `agent-bridge.ts`:
  - `GET /agent/skills`
  - `GET /agent/skills/:id`
  - `POST /agent/ping`
  - `POST /agent/command/:id/ack`
  - `POST /agent/report`
- Admin-protected bridge routes before the global admin middleware:
  - `POST /agents/:id/dispatch`
  - `POST /agents/:id/token`

Admin-protected after `requireAdminAuth`:

- Dashboard/activity: `/dashboard/summary`, `/activity`.
- James integration: `/james/status`, `/james/message`, `/james/jobs`, `/james/jobs/:id`, cancellation endpoints.
- Worktrees/repositories: `/worktrees`, diagnostics and metadata endpoints.
- Skills: `/skills`, `/skills/sync`, `/skills/:id`.
- Tasks: `/tasks`, `/tasks/:id`, `/tasks/:id/move`.
- Content: `/content`, `/content/:id`, `/content/:id/move`, `/content/pipeline/summary`.
- Calendar/events: `/events`, `/events/:id`, `/events/upcoming`.
- Memories: `/memories`, `/memories/:id`.
- Agents/team: `/agents`, `/agents/:id`.
- Contacts: `/contacts`, `/contacts/:id`.
- Integrations/settings: `/integrations`, `/integrations/:id`, integration assignment routes.
- Tools/settings: `/tools`, `/tools/:id`, tool grant/revoke and agent tool lookup routes.

## Frontend route structure

React routes in `artifacts/mission-control/src/App.tsx`:

- `/` and `/dashboard`: dashboard.
- `/tasks`: tasks.
- `/content`: content pipeline.
- `/calendar`: calendar.
- `/memory`: memory.
- `/workspaces`: repositories/workspaces.
- `/team`: team/agents and embedded James panel.
- `/skills`: skills registry and sync UI.
- `/contacts`: contacts.
- `/settings`: tools and integrations.

The sidebar labels `/workspaces` as `Repositories`.

## Skills system

- Local skills live under `skills/*/SKILL.md` with optional `metadata.json`.
- API service: `artifacts/api-server/src/services/skills.ts`.
- UI API hooks: `artifacts/mission-control/src/lib/skills-api.ts`.
- UI page: `artifacts/mission-control/src/pages/skills.tsx`.
- Admin API:
  - `GET /api/skills` lists skills and source status.
  - `POST /api/skills/sync` clones/fetches configured GitHub repositories, imports discovered `SKILL.md` files, and persists source statuses.
  - `GET /api/skills/:id` returns one skill document.
- Agent bridge API:
  - `GET /api/agent/skills?name=...&category=...` lets authenticated agents discover shared skills.
  - `GET /api/agent/skills/:id` lets authenticated agents read one skill.
- Default runtime root: `/opt/apps/ai-mission-control/skills` if it exists, otherwise nearest workspace `skills` directory.
- External git cache default: `<skills-root>/.cache/skill-sources`.
- Imported external skills default path: `<skills-root>/external/<owner>/<repo>/.../SKILL.md`.
- Source status persistence: `<skills-root>/.skill-source-status.json`.
- Git is required for runtime API skill sync. `GITHUB_TOKEN` is optional for public repositories and required for private/rate-limited repositories.
- A separate legacy/scripted sync path exists at `scripts/sync-external-skills.mjs`; it uses GitHub HTTP APIs and writes directly under the skills root. It does not use the same default source registry as `services/skills.ts`, so prefer the API service path unless intentionally maintaining the script.

## Agent/team and orchestrator model currently implemented

- Persistent agents are stored in `agents` table and exposed through `/api/agents`.
- Built-in operational agents are merged into API responses from `artifacts/api-server/src/config-operational-agents.ts` when not present in the database.
- Current configured orchestrator name is `James`; this is a role assignment, not the product identity.
- Configured skill assignment is name-based in `CONFIGURED_AGENT_SKILLS`.
- Agent bridge supports pull-based work:
  - Agents authenticate with bearer tokens.
  - Agents ping for assigned tasks and queued commands.
  - Admin can dispatch a queued command to an agent.
  - Agents can report activity, complete tasks, and store memory.
  - Agent command acknowledgment records delivery time.
- Tool and integration access are modeled through `agent_tools`, `agent_tool_access`, `integrations`, and `agent_integrations` tables.

## Task, memory, repository, calendar, contacts, content, and settings modules

- Tasks: database-backed CRUD plus status moves. Some UI task context/assignee choices are currently static and James-oriented.
- Memory: database-backed CRUD plus agent report path for memory creation.
- Repositories/workspaces: Orca-style worktree metadata and diagnostics live in `artifacts/api-server/src/services/worktree-manager.ts`, `artifacts/api-server/src/routes/worktrees.ts`, and `artifacts/mission-control/src/pages/workspaces.tsx`.
- Calendar: `events` table and `/events` routes.
- Contacts: `contacts` table and `/contacts` routes.
- Content: `content` table and `/content` routes.
- Settings: tools and integrations pages backed by `/tools` and `/integrations` API routes.

## James, Hermes, Docker, PM2, nginx, and systemd relationship

Based on this checkout plus supplied server context:

- Mission Control production runtime is Node/systemd, not Docker.
- Known service name: `ai-mission-control-api.service`.
- Known service command: `/root/.local/bin/node dist/index.mjs`.
- There are no Docker, PM2, nginx, or systemd unit files in this repository.
- Hermes is not Mission Control. Hermes may run separately on the server.
- James integration calls `/usr/local/bin/james-hermes` from `artifacts/api-server/src/routes/james.ts`; that is an integration endpoint, not the platform runtime.
- The repo does not contain nginx configuration, so exact `mission.customli.io` routing must be verified on the host with `sudo nginx -T`. The code allows CORS from `https://mission.customli.io`, implying the domain is expected to reach either the API directly or a frontend host that calls the API.

## Orca/vendor/orchestration relationship

- `docs/orca-reuse-analysis.md` records an architecture/reuse plan for `stablyai/orca`; it states that the upstream zip was not present and no runtime code was vendored in that patch.
- `docs/worktree-manager.md` documents later Orca-style workspace metadata additions.
- Current repo contains adapted Orca-style concepts: workspace/worktree metadata, diagnostics, repository UI, and documentation vocabulary.
- Missing from Orca-style behavior: a generalized terminal/PTY streaming layer, launcher registry for arbitrary CLI agents, durable session logs, task-provider imports, and a full capability/routing engine.
