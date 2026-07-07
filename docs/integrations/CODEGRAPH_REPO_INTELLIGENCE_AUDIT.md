# CodeGraph repo intelligence audit

## Executive recommendation

CodeGraph is worth supporting as an optional repository intelligence provider, but not as Mission Control core infrastructure yet. The safe next step is an additive, disabled-by-default adapter and data model that can detect a local CodeGraph installation, report per-repository index health, and run approved read-only queries against explicitly allowlisted repositories. Do not install CodeGraph on production, do not wire it into Hermes or agent runtimes, and do not auto-index repositories until the provider abstraction, permissions, audit logging, and secret-redaction controls exist.

Mission Control should frame CodeGraph as a local codebase intelligence/indexing layer. It is not Mission Control and it is not an agent. It can provide context to agents such as Codex, Goose, Hermes, Gemini, OpenCode, Cursor-style tools, and future custom agents after Mission Control grants repository-scoped access.

## Source notes

This audit is based on the current Mission Control repository plus the public CodeGraph README and project metadata at `https://github.com/colbymchenry/codegraph` reviewed on 2026-07-07. No CodeGraph install, initialization, or runtime wiring was performed.

## 1. CodeGraph capability model

### Install options

CodeGraph is distributed as the npm package `@colbymchenry/codegraph`. Documented install paths include:

- Interactive one-shot installer via `npx @colbymchenry/codegraph`.
- Global npm install via `npm install -g @colbymchenry/codegraph`.
- `codegraph install` to configure detected agent MCP settings.
- Non-interactive installer flags including `--yes`, `--target=...`, `--location=global|local`, `--no-permissions`, and `--print-config`.
- Programmatic library usage through the npm package for Node-based embedders.

Mission Control should not run any of these automatically in production. The adapter should only detect whether an approved binary exists and surface installation guidance.

### Project initialization model

The per-project lifecycle is separate from agent installation:

- `codegraph init [path]` creates a project index and builds the graph.
- `codegraph uninit [path]` removes a project from CodeGraph management.
- `codegraph index [path] --force` performs full re-indexing.
- `codegraph sync [path]` performs incremental updates.
- `codegraph status [path]` reports statistics and pending sync state.
- `codegraph unlock [path]` removes stale indexing locks.

Mission Control should require repository approval before init, uninit, index, sync, unlock, or watch operations.

### Local `.codegraph` behavior

CodeGraph stores per-project data under `.codegraph/`, including a SQLite graph database at `.codegraph/codegraph.db`. The graph is derived from source parsing, not LLM summaries. CodeGraph excludes dependency/build/cache directories, honors `.gitignore`, and skips files larger than documented size thresholds. Project indexes are left behind by global agent uninstall and must be removed per project with `codegraph uninit` or controlled deletion.

### Auto-sync and watch behavior

When running as MCP server, CodeGraph watches source changes using OS file notifications and debounced auto-sync. The documented default debounce is 2 seconds, configurable through `CODEGRAPH_WATCH_DEBOUNCE_MS`. It also performs connect-time reconciliation and surfaces stale-file warnings in responses while changes are pending. Manual `codegraph sync` is mainly needed if watching is disabled or scripts require a pre-flight sync.

Mission Control should treat auto-sync as a privileged per-repo background capability. It should default to unwatched until explicitly enabled and should show watch state, pending files, and last sync/index time.

### MCP server behavior

CodeGraph exposes an MCP server via `codegraph serve --mcp`. The default MCP surface emphasizes one tool, `codegraph_explore`, which returns relevant source, relationship/call paths, and blast-radius context. Additional tools can be enabled through `CODEGRAPH_MCP_TOOLS`, but Mission Control should not broaden the MCP surface by default.

The README lists supported agent configuration targets including Claude Code, Cursor, Codex CLI, opencode/OpenCode, Hermes Agent, Gemini CLI, Antigravity IDE, and Kiro. Mission Control should not let CodeGraph write global agent config directly in production. Instead, Mission Control should broker approved queries or generate per-agent MCP config snippets for review.

### Supported languages

Documented language support includes TypeScript, JavaScript, ArkTS, Python, Go, Rust, Java, C#, Visual Basic .NET, PHP, Ruby, C, C++, CUDA, Objective-C, Metal, Swift, Kotlin, Scala, Dart, Lua, Luau, R, Nix, Erlang, CFML, COBOL, Solidity, Terraform/OpenTofu, Svelte, Vue, Astro, Liquid, and Pascal/Delphi. The README also claims framework-aware route extraction and specific mixed iOS / React Native / Expo relationship handling.

### Query and explore capabilities

CLI/query capabilities include:

- `codegraph query <search>` for symbol search.
- `codegraph explore <query>` for source snippets, call paths, and impact context.
- `codegraph node <symbol|file>` for a symbol or line-numbered file view.
- `codegraph files [path]` for file structure.
- `codegraph callers <symbol>` and `codegraph callees <symbol>`.
- `codegraph impact <symbol>`.
- `codegraph affected [files...]` for affected test discovery.
- JSON output options for several commands.

### Code graph outputs

The graph stores files, symbols, edges, calls, imports, inheritance/implementation relationships, route mappings, full-text search data, and selected heuristic cross-language/framework edges. Outputs can include verbatim source snippets, line-numbered file content, relationship maps, call paths, dependency paths, and blast-radius summaries.

### Blast radius and change impact features

The strongest fit for Mission Control is impact analysis:

- `codegraph impact` can trace downstream/upstream effect around a symbol.
- `codegraph affected` can map changed files to likely affected test files through import dependencies.
- `codegraph_explore` includes blast-radius context inline for broader natural-language queries.

These outputs should inform, not replace, human approval and CI. They are advisory static-analysis artifacts.

### Limitations and risks

- Static analysis can miss dynamic runtime behavior, generated code, reflection, runtime dependency injection, shell scripts, database migrations, and external service contracts.
- Some edges are heuristic. Mission Control must expose provenance/confidence when available.
- Verbatim source returned to agents can include secrets if secrets are committed. Mission Control needs redaction and output auditing.
- Automatic watcher processes can consume CPU/memory or hold locks.
- MCP/global install can modify agent config files and permissions; Mission Control should not allow this path without explicit review.
- Node/library embedding has runtime requirements; CLI/MCP packaging may differ from embedded usage.
- Results are only useful when the index is fresh and queried directly.
- The project is third-party infrastructure. Version pinning, license review, supply-chain review, and rollback planning are required before production enablement.

## 2. Mission Control fit

### Repositories module

Current Mission Control repository support is worktree-centric: an allowlisted Mission Control repository, read-only repository list endpoint, git/worktree diagnostics, metadata storage, and safety-gated workspace operations. CodeGraph would supplement this with code structure, language inventory, index health, dependency graphs, and queryable architecture context.

### Tasks module

Tasks can benefit from pre-flight repository context: likely files, relevant symbols, affected tests, dependency owners, implementation caveats, and QA checklist suggestions. This should be generated as a derived task brief, not written into existing task behavior automatically.

### Agent task assignment

Mission Control can use repository intelligence to route tasks to agents based on allowed repository access, language capability, changed area, blast radius, and required test stack. The decision must remain auditable and permission-scoped.

### Codex implementation briefs

For Codex, Mission Control could generate briefs containing:

- repository path and branch/worktree scope;
- relevant files/symbols from `explore`;
- known call paths and dependencies;
- risky affected areas;
- suggested tests from `affected`;
- explicit instruction that CodeGraph is advisory and source files remain canonical.

### Goose, Hermes, Codex, Gemini runtime adapters

Runtime adapters should not each own indexing logic. They should call a common Repo Intelligence Provider interface. The adapter can either return context to Mission Control for inclusion in prompts or broker repository-scoped MCP access when approved.

### QA planning, pull request review, and test selection

CodeGraph can support QA planning by mapping changed files to affected tests, tracing public entry points through changed symbols, and identifying dependencies/callers. For PR review, it can provide blast-radius summaries and architecture context, but it must not replace CI, code review, or production approvals.

### Dependency mapping and architecture understanding

CodeGraph is well-aligned to architecture questions: route-to-handler flows, symbol callers/callees, import graphs, interface implementations, and cross-language bridges. Mission Control should expose these as read-only intelligence panels and generated briefs.

## 3. Proposed Repo Intelligence Provider abstraction

Define a generic provider contract before binding Mission Control to CodeGraph:

| Field/capability         | Purpose                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `providerName`           | Stable provider id, e.g. `codegraph`.                                                          |
| `displayName`            | Human label.                                                                                   |
| `repoId`                 | Mission Control allowlisted repository id.                                                     |
| `repoPath`               | Canonical approved repository root; never arbitrary caller input.                              |
| `indexPath`              | Controlled index directory, normally `<repoPath>/.codegraph`.                                  |
| `status`                 | `not_installed`, `not_initialized`, `indexing`, `ready`, `stale`, `error`, `disabled`.         |
| `lastIndexedAt`          | Last full index timestamp if known.                                                            |
| `lastSyncedAt`           | Last incremental sync timestamp if known.                                                      |
| `watched`                | Whether a background watcher/daemon is active.                                                 |
| `supportedLanguages`     | Languages detected or provider-supported for this repo.                                        |
| `agentAccessPermissions` | Per-agent grants: none/read/query/mcp/admin.                                                   |
| `queryInterface`         | Structured methods such as `search`, `explore`, `node`, `impact`, `affected`, `files`.         |
| `healthCheck`            | Safe status command with timeout and no mutation.                                              |
| `reindexCommand`         | Disabled by default; explicit admin action.                                                    |
| `logs`                   | Provider command logs and audit records.                                                       |
| `errorState`             | Last error, command, exit code, stderr summary, and timestamp.                                 |
| `securityRestrictions`   | Repo allowlist, path jail, secret redaction, command allowlist, output limits, timeout policy. |

Provider outputs should be stored as derived audit artifacts, not canonical source truth.

## 4. CodeGraph adapter design

### Adapter responsibilities

- **Install detection:** check approved binary paths with `codegraph --help` or `command -v codegraph`; never run installer automatically.
- **Version detection:** run `codegraph --version` with a short timeout; persist version and detection time.
- **Per-repo init:** gated admin operation for allowlisted repo only; command shape `codegraph init <repoPath>`.
- **Per-repo uninit:** gated admin operation; command shape `codegraph uninit <repoPath> --force` only after explicit approval.
- **Status check:** read-only `codegraph status <repoPath>`; parse stats and pending sync.
- **Manual reindex:** gated admin operation `codegraph index <repoPath> --force --quiet`.
- **Incremental sync:** gated admin operation `codegraph sync <repoPath>`.
- **Auto-sync status:** detect watcher/daemon status through `status`, daemon management output, pid metadata, or adapter-maintained process records.
- **MCP config detection:** read-only scan of known config locations only if permitted; report whether CodeGraph config exists; do not write config.
- **Query/explore endpoint:** `explore`, `query`, `node`, `files`, `callers`, `callees`, `impact`, and `affected`, preferably JSON where available.
- **Safe command wrapper:** fixed executable, fixed argument templates, canonicalized repo path, cwd set to repo root, env scrubbed, max stdout/stderr bytes, no shell interpolation.
- **Timeout behavior:** short status/version timeout; moderate query timeout; longer explicit indexing timeout; cancellation and audit on timeout.
- **Audit logs:** record actor, agent, repo id, command class, normalized args, timestamp, duration, exit code, output hash, redaction status, and approval id for mutating/indexing actions.

### Proposed API shape for later patch

- `GET /api/repo-intelligence/providers`
- `GET /api/repo-intelligence/repositories/:repoId/status`
- `POST /api/repo-intelligence/repositories/:repoId/query` (read-only, audited)
- `POST /api/repo-intelligence/repositories/:repoId/impact` (read-only, audited)
- `POST /api/repo-intelligence/repositories/:repoId/affected-tests` (read-only, audited)
- `POST /api/repo-intelligence/repositories/:repoId/index` (disabled unless admin-approved)
- `POST /api/repo-intelligence/repositories/:repoId/sync` (disabled unless admin-approved)

No endpoint should accept arbitrary filesystem paths from callers.

## 5. UI model

### Repositories page

Add a read-only Code Intelligence summary column/card after backend support exists:

- provider status;
- initialized/not initialized;
- index health;
- last index/sync time;
- watched/unwatched;
- languages detected;
- latest error state.

### Individual repo detail page

Add a `Code Intelligence` tab with facts only:

- provider name and version;
- repo root and controlled index path;
- status and health;
- last indexed/synced;
- supported languages found;
- graph statistics if available;
- pending sync files;
- audit-log link;
- explicit disabled controls for install/init if current user lacks permission.

### Explorer/actions

Add guarded actions:

- `Generate task brief with repo context` — creates a derived brief from approved query templates.
- `Run blast radius analysis` — accepts selected files/symbols and returns impacted areas.
- `Suggest tests to run` — uses `affected` output plus existing test metadata when available.
- Dependency/call-path explorer — table/tree view of callers/callees and routes.
- Affected files — table showing source file, related symbols, callers, tests, confidence/provenance.

No UI should imply CodeGraph is authoritative. Labels should say “advisory static analysis” where relevant.

## 6. Security model

Required safeguards:

- CodeGraph runs locally per approved repository only.
- No unrestricted filesystem access; repository selection is by Mission Control repo id.
- The adapter canonicalizes and validates repo paths under an allowlist.
- Do not auto-index unapproved repos.
- Index path must be controlled and visible to operators.
- Agents need explicit permission to query each repo index.
- Query, output metadata, and generated briefs must be audit logged.
- Output must pass secret-redaction filters before display or agent delivery.
- Limit output size and avoid returning whole repositories.
- Disable global agent config writes in production.
- Disable install/uninstall by default in production.
- Production actions still require approval; intelligence cannot approve deploys, schema changes, auth changes, or runtime changes.
- Background watchers must be opt-in and stoppable.
- Third-party package version must be pinned and reviewed before enablement.

## 7. Deployment model

Recommended staged deployment:

1. **Now:** documentation only. Do not install.
2. **Patch 1:** add provider interface, disabled CodeGraph adapter, read-only detection, and docs/tests.
3. **Patch 2:** add read-only status/query endpoints behind explicit config flag.
4. **Patch 3:** add UI read-only Code Intelligence tab.
5. **Patch 4:** add gated indexing/sync controls and audit logs.
6. **Later:** evaluate Mission Control-managed MCP service or per-agent MCP snippets.

Deployment options assessment:

| Option                          | Recommendation                                                                |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Installed globally on VPS       | Possible later, but only pinned and admin-managed. Do not do now.             |
| Installed per repo              | Avoid initially; duplicates supply-chain footprint.                           |
| npm package dependency          | Best for adapter/library experiments if Node runtime requirements fit.        |
| bundled installer               | Do not run automatically; it writes agent config.                             |
| on demand CLI                   | Good first integration path for detection/status/query with wrapper.          |
| MCP server                      | Useful later for agents, but Mission Control should broker permissions first. |
| per-agent install               | Avoid; centralize through provider abstraction.                               |
| Mission Control-managed service | Long-term option after audit, resource limits, and logs exist.                |

## 8. Comparison with current Mission Control repository module

### What Repositories currently does

Current repository/workspace support provides:

- a sidebar `Repositories` route mapped to `/workspaces`;
- configured repository listing;
- read-only git status and worktree diagnostics;
- workspace/worktree listing;
- metadata paths and safety-gated worktree operations;
- an initial allowlist containing the Mission Control repository.

### What is missing

Missing capabilities include:

- code intelligence provider abstraction;
- per-repo code index status;
- language inventory;
- symbol search;
- dependency graph;
- caller/callee graph;
- blast-radius analysis;
- affected test suggestions;
- generated implementation briefs;
- per-agent repo-index query grants;
- query/output audit logs;
- secret redaction for indexed-source output.

### What CodeGraph could replace

CodeGraph should not replace repository/worktree management. It could replace ad-hoc grep-first exploration for architecture questions and task-context gathering when an approved index exists.

### What CodeGraph should only supplement

It should only supplement:

- git status and branch/worktree truth;
- source files as canonical truth;
- CI and test runners;
- human code review;
- deployment approvals;
- task assignment policy;
- security and auth controls.

### Later database tables/API routes

Potential additive tables or durable stores:

- `repo_intelligence_providers`
- `repo_intelligence_indexes`
- `repo_intelligence_agent_grants`
- `repo_intelligence_queries`
- `repo_intelligence_audit_events`
- `repo_intelligence_generated_briefs`
- `repo_intelligence_errors`

Potential routes are listed in the adapter section. All should be additive and disabled by default until approved.

## 9. Clear next implementation patch if approved

If approved, the safest next patch is documentation-backed scaffolding only:

1. Add a `RepoIntelligenceProvider` TypeScript interface in the API server.
2. Add a disabled `CodeGraphProvider` that supports install/version/status detection only.
3. Add unit tests for path allowlisting, command argument construction, timeout handling, and “disabled by default”.
4. Add read-only `GET /api/repo-intelligence/providers` returning provider availability and disabled status.
5. Do not add init/index/sync/query endpoints yet.
6. Do not install CodeGraph, write MCP config, change Hermes, alter auth, or change Mission Control runtime.

## Acceptance criteria status

- No production behavior changes: satisfied by this documentation-only patch.
- No install on production: satisfied; no install command was run.
- No auth/Hermes/runtime changes: satisfied.
- Clear recommendation: support later as optional provider, not core runtime.
- Clear abstraction: provided above.
- Clear next implementation patch: provided above.
