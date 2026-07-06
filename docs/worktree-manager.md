# Worktree Manager

Patch #16 added the backend-only foundation for isolated task workspaces. Patch
#17 keeps those diagnostics and adds a disabled-by-default lifecycle MVP for
creating and cleaning up task worktrees.

No James execution is wired to worktrees in this patch. No database schema or
SBB production behavior is changed.

## Scope

- List configured repositories.
- Calculate a safe future worktree path for a task.
- Validate that workspace paths stay inside configured allowlisted roots.
- Validate task branch names before any Git mutation is attempted.
- Reject arbitrary caller-supplied paths; callers select a repository id and task
  id only.
- Prevent SBB production writes by refusing protected repository/path targets.
- Inspect the current Git branch and short status.
- Inspect whether `git worktree` is available for the configured repository.
- Create a task worktree only when explicit safety gates are enabled.
- Inspect Git status after a successful creation.
- Cleanup/delete a task worktree only when explicit cleanup safety gates are
  enabled.
- Expose admin-protected diagnostics under `/api/worktrees/*`.

The initial allowlist contains only the Mission Control repository:

```text
/opt/apps/ai-mission-control
```

SBB production is not configured and must not be added without an explicit
future change and production approval.

## Safety Gates

Creation and cleanup are disabled by default. A request must pass both gates to
mutate the filesystem:

| Operation        | Environment gate              | Request gate       |
| ---------------- | ----------------------------- | ------------------ |
| Create worktree  | `WORKTREE_CREATION_ENABLED=1` | `safetyFlag: true` |
| Cleanup worktree | `WORKTREE_CLEANUP_ENABLED=1`  | `safetyFlag: true` |

Dry-run requests do not require the environment gate and do not mutate Git or the
filesystem.

## Safety Model

- Repository selection is by configured repository id, not by caller-supplied
  filesystem path.
- Git commands are executed with `execFile` and fixed argument arrays; no shell
  command strings are constructed from request data.
- Worktree paths are derived from a sanitized task id and a configured worktree
  root.
- Validation rejects paths outside the configured worktree root before creation
  or cleanup.
- SBB production path markers are blocked even if accidentally introduced later.
- Branch names reject whitespace, shell-sensitive characters, Git ref traversal,
  `.lock` suffixes, and path traversal segments.
- Cleanup checks Git status and refuses dirty worktrees unless `force: true` is
  explicitly supplied with the cleanup safety gates.

## API Diagnostics and Lifecycle

Admin-authenticated callers can use:

```text
GET /api/worktrees/repositories
GET /api/worktrees/path-preview?repoId=mission-control&taskId=123
GET /api/worktrees/diagnostics?repoId=mission-control&taskId=123
GET /api/worktrees/repositories/mission-control/git
POST /api/worktrees/create
POST /api/worktrees/cleanup
```

Create dry-run body:

```json
{
  "repoId": "mission-control",
  "taskId": "123",
  "branchName": "codex/patch-17-task-123",
  "dryRun": true
}
```

Actual creation requires both `WORKTREE_CREATION_ENABLED=1` and
`"safetyFlag": true` in the request body.

Cleanup dry-run body:

```json
{
  "repoId": "mission-control",
  "taskId": "123",
  "dryRun": true
}
```

Actual cleanup requires both `WORKTREE_CLEANUP_ENABLED=1` and
`"safetyFlag": true` in the request body. Dirty worktrees require `"force": true`.

## Local Diagnostics

A local diagnostic command is available when dependencies are installed:

```bash
pnpm exec tsx artifacts/api-server/src/scripts/worktree-diagnostics.ts mission-control 123
```

Dry-run creation planning is also available and does not mutate Git:

```bash
pnpm exec tsx artifacts/api-server/src/scripts/worktree-diagnostics.ts --dry-run mission-control 123 codex/patch-17-task-123
```

## Intended Lifecycle

1. Create worktree: create from an allowlisted repo into the configured worktree
   root after branch/base/path validation and explicit safety gates.
2. Assign agent: future phase; bind a Mission Control task and agent to the
   isolated workspace.
3. Run task: future phase; launch agent work from the workspace path, not the
   main checkout.
4. Collect logs: future phase; stream stdout/stderr, command events, and task
   metadata into Mission Control.
5. Diff/PR: future phase; inspect branch diff, summarize changes, and prepare a
   pull request.
6. Cleanup: remove task-scoped runtime state, inspect dirty state, then remove
   the Git worktree only when cleanup safety gates allow it.

Patch #17 implements step 1 and step 6 as backend service/API lifecycle
primitives only. It intentionally does not route James execution into worktrees.

## Patch #19 Metadata Model

Patch #19 adds an Orca-style workspace metadata layer without changing database
schemas, canonical task data, frontend code, or the Patch #17 lifecycle safety
gates. Metadata is persisted as deterministic JSON under each configured
worktree root (`mission-control-worktrees.json`) and can be rebuilt from the
Git worktree list plus managed create records.

The metadata store contains:

- `schemaVersion` for explicit future migrations.
- One record per Mission Control-managed task worktree.
- Stable workspace ids in the form `<repoId>:<taskId>`.
- Orca-compatible fields such as `workspaceKind`, `displayName`, `comment`,
  linked issue/PR placeholders, archive/unread flags, sort order, activity
  timestamp, and workspace status.

Diagnostics remain backward compatible and now include `metadata` and
`workspaces` alongside the existing `repository`, `pathPreview`, `git`,
`worktree`, `creation`, and `cleanup` payloads. A read-only workspace endpoint
is also available:

```txt
GET /api/worktrees/workspaces?repoId=mission-control
```

Rebuild / rollback:

- Rebuild: run the standard worktree diagnostics command to compare Git
  worktrees with metadata. Managed records are deterministic for newly created
  worktrees.
- Rollback metadata only: delete the derived
  `<worktreeRoot>/mission-control-worktrees.json` file. This does not touch Git
  worktrees, database tables, task data, ingestion, or frontend state.
- Cleanup: use the existing cleanup endpoint or script path. Cleanup still
  requires `WORKTREE_CLEANUP_ENABLED=1` plus `safetyFlag: true`; dirty worktrees
  still require `force: true`.
