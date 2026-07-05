# Patch 16 — Orca reuse analysis

Source reviewed: `stablyai/orca` from the user-supplied MIT-licensed upstream reference. The uploaded `orca-main.zip` was not present in this checkout, so this patch records an architecture/reuse plan only and does not vendor code or integrate runtime behavior.

## Summary

Orca is an Electron-based agent development environment organized around isolated git worktrees, terminal-backed CLI agents, source-control panels, task provider integrations, and a mobile companion. Mission Control is currently a pnpm monorepo with a React/Vite dashboard, an Express API server, generated OpenAPI clients, and Drizzle-backed domain tables for agents, tasks, activity, tools, integrations, memories, contacts, and events.

The safest reuse path is to copy concepts and selected pure backend utilities first, then adapt UI and Electron-specific components later. No production logic, SBB production code, canonical tables, ingestion flows, or UI behavior should be changed during this reconnaissance patch.

## Current Mission Control architecture comparison

| Area          | Mission Control today                                                                      | Orca reference                                                              | Reuse implication                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Runtime shell | Web app plus Express API in `artifacts/api-server` and `artifacts/mission-control`.        | Desktop Electron app with main/preload/renderer plus relay process.         | Avoid direct Electron coupling; adapt service boundaries into backend services and optional browser clients. |
| Agent model   | Persistent CRUD agents plus bridge heartbeat/report/dispatch/token/tool credential routes. | Terminal-launched CLI agents tied to workspace/worktree sessions.           | Adapt launcher registry and session lifecycle around existing agent bridge rather than replacing it.         |
| Tasks         | Database-backed tasks and activity routes.                                                 | Worktree/task contexts from GitHub/Linear/issue workflows.                  | Add derived workspace metadata, not canonical task mutation.                                                 |
| Terminal/logs | In-memory James job logs and API responses; no general PTY streaming layer.                | PTY, terminal splits, scrollback persistence, relay protocol.               | Build a new additive terminal session service; do not modify existing job or bridge behavior.                |
| Git           | No first-class worktree/status/diff service visible in the current API.                    | Worktree lifecycle, source-control integration, diff annotations, PR flows. | Phase 1 should add a read-only/worktree manager package before any UI integration.                           |
| GitHub/PR     | Existing integrations table/assignment APIs, but no native PR panel in API spec.           | Native GitHub/Linear browsing and PR workflows.                             | Reuse GitHub concepts later behind new read-only endpoints and explicit credentials.                         |
| Mobile        | No mobile companion layer.                                                                 | Companion app monitors and steers agents remotely.                          | Treat as a future notification/command API pattern, not code to copy now.                                    |

## Reusable Orca file/module map

These paths refer to the upstream Orca repository layout.

### Copy directly only after license notice preservation

Direct copy should be limited to pure utilities with minimal Electron/UI coupling:

- `src/main/git/*` — candidate pure git command wrappers, repository discovery, branch/worktree helpers.
- `src/main/source-control/*` — candidate status/diff parsing utilities if separable from Electron IPC.
- `src/main/agent-trust-presets.ts` — candidate static registry/preset data shape if it is license-compatible and dependency-light.
- `src/shared/*` and `src/types/*` — candidate shared protocol/type definitions that can be vendored with attribution if they do not pull desktop runtime dependencies.
- `skills/orca-cli/*` — candidate operational docs/CLI patterns for agent-driven worktree commands, not runtime code.

### Adapt rather than copy

These modules appear valuable but are coupled to Orca's desktop runtime, relay protocol, storage, or UI assumptions:

- `src/main/pty/*` and `src/main/ghostty/*` — adapt terminal/session abstraction, scrollback model, event envelopes, and lifecycle tests; avoid wholesale copy because Mission Control is web/server-first.
- `src/relay/*` — adapt the relay/event-envelope concept if Mission Control later needs WebSocket-based terminal/log streaming.
- `src/main/github/*`, `src/main/linear/*`, `src/main/gitlab/*`, `src/main/bitbucket/*`, `src/main/gitea/*`, and `src/main/azure-devops/*` — adapt provider boundary and credential handling, but integrate through existing Mission Control integrations/tool vault.
- `src/main/claude/*`, `src/main/codex/*`, `src/main/opencode/*`, `src/main/gemini/*`, `src/main/pi/*`, and other agent-specific folders — adapt launcher registry shape and health/status conventions.
- `src/main/project-groups/*`, `src/main/local-project-runtime-resolution.ts`, and related workspace selection modules — adapt into a server-side workspace picker with explicit allowlists.
- `src/renderer/src/components/*` task, terminal, source-control, browser, and workspace panes — use as UX reference only; do not copy into the current dashboard without a separate UI patch.
- `mobile/*` — adapt companion concepts: remote notifications, command follow-ups, and read-only monitoring API; do not copy app code into the web monorepo.

### Avoid for Mission Control reuse

- Electron app bootstrap and window/menu/tray modules: `src/main/index.ts`, `src/main/window/*`, `src/main/menu/*`, `src/main/tray/*`, `src/preload/*`.
- Browser/computer-use/design-mode modules: `src/main/browser/*`, `src/main/computer/*`, and related renderer browser panes until a specific browser automation requirement exists.
- Telemetry, crash reporting, star nags, account usage trackers, and updater code: `src/main/telemetry/*`, `src/main/crash-reporting/*`, `src/main/star-nag/*`, updater loaders.
- Native/SSH/runtime-specific modules (`native/*`, `src/main/ssh/*`, ephemeral VM runtime files) until remote execution is explicitly approved.
- Any module that writes repository state implicitly, stores secrets outside Mission Control's credential model, or assumes desktop-local trust.

## Reuse by requested capability

| Capability               | Orca reusable source                                                            | Mission Control fit                                 | Recommendation                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Git worktrees            | `src/main/git/*`, worktree CLI docs, source-control utilities                   | New additive backend package/service                | First implementation patch should build a deterministic worktree discovery/creation/removal service with dry-run and audit logs. |
| Task workspaces          | project groups, local runtime resolution, GitHub/Linear issue-to-worktree flows | Derived workspace metadata linked to existing tasks | Adapt only after Phase 1, using new tables or config files; no canonical task schema mutation without explicit approval.         |
| Agent/session management | agent-specific launcher folders, trust presets, relay/session concepts          | Existing agents plus bridge routes                  | Add launcher registry as configuration first, then map launches to existing agent ids.                                           |
| Terminal/log streaming   | `src/main/pty/*`, `src/main/ghostty/*`, `src/relay/*`                           | Missing generic PTY streaming layer                 | Adapt as a separate session/log service with append-only logs and bounded retention.                                             |
| Git status/diff tracking | `src/main/source-control/*`, git helpers                                        | Missing read-only status endpoints                  | Build read-only status/diff snapshots before PR actions.                                                                         |
| PR/GitHub flow           | `src/main/github/*` plus source-control annotations                             | Existing integrations/tools                         | Adapt via GitHub token from tool vault; read-only PR list first, then explicit create/update actions.                            |
| Mobile companion         | `mobile/*` and notification/unread concepts                                     | Future companion/API consumer                       | Reuse concepts only: command queue, notifications, unread/completion states.                                                     |
| Workspace picker         | project groups/local project runtime                                            | Current dashboard has no general picker             | Adapt as server-side repository allowlist plus UI later.                                                                         |
| Agent launcher registry  | agent folders for Codex, Claude, OpenCode, Pi, etc.                             | Existing agent metadata can host launcher config    | Phase 2: config-driven registry with executable detection and no launch side effects by default.                                 |

## Integration risks

1. **License/notice risk** — Orca is MIT, but copied files must retain original copyright/license notices and be recorded in a third-party notices file.
2. **Runtime mismatch** — Orca is Electron/desktop-first; Mission Control is web/API-first. Direct UI or IPC code copy would create unnecessary coupling.
3. **Data integrity risk** — Worktree and PR operations mutate git repositories. Initial endpoints must be dry-run/read-only where possible and require explicit audit records for mutating commands.
4. **Credential risk** — GitHub, agent CLIs, and provider tokens must flow through existing credential/tool handling; no new secret stores should be introduced.
5. **Concurrency risk** — Multiple agents may write concurrently. Worktree paths, branch names, lock files, and terminal sessions need deterministic IDs and collision protection.
6. **Process lifecycle risk** — PTY/agent processes can become orphaned. Add heartbeat, cleanup, and bounded log retention before exposing launches broadly.
7. **UI risk** — Dashboard changes are explicitly out of scope here. Any future UI must be a separate patch and should consume stable read-only APIs first.
8. **SBB safety risk** — No SBB production, canonical data, ingestion, POS, or staff-facing flows should be touched by any Orca integration phase.

## Phased integration plan

### Phase 1: Worktree manager

- Add a new package or API-server module for git repository/worktree operations.
- Implement read-only discovery first: repo root, current branch, worktree list, dirty status summary.
- Add deterministic worktree naming: task id, agent id, source branch, timestamp-free stable slug, and collision suffix only when necessary.
- Add dry-run planning for create/remove before enabling mutation.
- Preserve audit records for each planned and executed git operation.
- Do not alter tasks, agents, SBB data, or existing API behavior.

### Phase 2: Agent registry

- Add a config-driven launcher registry for Codex, Claude Code, OpenCode, Pi, and future CLIs.
- Store executable command templates, required env vars, trust level, and supported workspace modes.
- Provide read-only executable detection and validation endpoint.
- Map registry entries to existing Mission Control agents only through explicit admin action.

### Phase 3: Task terminal/logs

- Add terminal session service with deterministic session ids and append-only logs.
- Start with server-sent events or WebSocket streaming behind admin auth.
- Keep logs separate from existing canonical activity unless explicitly reported as derived activity.
- Add cleanup and retention policy before process launch is broadly enabled.

### Phase 4: Git/diff/PR panel

- Add read-only status/diff snapshots for each workspace.
- Add PR list/read endpoints using existing integration credentials.
- Add explicit PR create/update later with preview, confirmation, and audit logging.
- Keep GitHub writes out of request paths where possible; use jobs for long operations.

### Phase 5: OpenClaw/OpenCode integration

- Add OpenCode/OpenClaw launcher definitions in the registry.
- Validate executable availability, required env, workspace isolation, and log streaming.
- Run launches only inside managed worktrees.
- Require rollback instructions: terminate session, remove worktree, delete derived workspace/session records.

## License compliance steps

- Add `docs/third-party/orca/NOTICE.md` before copying any Orca source.
- Preserve Orca MIT license text next to vendored files or in a repository-level third-party notices file.
- Include upstream repository URL, commit SHA or release tag, copied file list, and local modifications summary.
- Keep copied files isolated under a clearly named namespace such as `vendor/orca` or adapted modules with file headers referencing Orca.
- For adapted code, document which upstream file it was derived from and what changed.
- Re-run license review whenever updating vendored Orca code.

## Recommended first implementation patch

Build Phase 1 as an additive backend-only worktree manager:

1. Create a new `lib/worktree-manager` package or `artifacts/api-server/src/services/worktrees` module.
2. Implement pure functions for repository validation, `git worktree list --porcelain` parsing, branch/worktree naming, and dry-run create/remove plans.
3. Add tests with fixture outputs for clean, dirty, detached, and missing-repo states.
4. Add read-only API endpoints only after the service is covered by tests.
5. Defer actual `git worktree add/remove`, terminal launch, UI panels, and PR creation to later patches.

This first patch has the best safety profile because it is additive, deterministic, testable without real repository mutation, and creates the foundation required by agent launchers and terminal sessions.
