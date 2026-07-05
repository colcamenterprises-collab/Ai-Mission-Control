# Worktree Manager

Patch #16 adds the first backend-only foundation for isolated task workspaces.
It is intentionally diagnostics-only: it does not create, remove, or mutate Git
worktrees.

## Phase 1 Scope

- List configured repositories.
- Calculate a safe future worktree path for a task.
- Validate that workspace paths stay inside configured allowlisted roots.
- Inspect the current Git branch and short status.
- Inspect whether `git worktree` is available for the configured repository.
- Expose admin-protected diagnostics under `/api/worktrees/*`.

The initial allowlist contains only the Mission Control repository:

```text
/opt/apps/ai-mission-control
```

SBB production is not configured and must not be added without an explicit
future change and production approval.

## Safety Model

- Repository selection is by configured repository id, not by caller-supplied
  filesystem path.
- Git commands are executed with `execFile` and fixed argument arrays; no shell
  command strings are constructed from request data.
- Future worktree paths are derived from a sanitized task id and a configured
  worktree root.
- Validation rejects paths outside the configured repository/worktree roots.
- Worktree creation is present only as a disabled stub.

## Diagnostics

Admin-authenticated callers can use:

```text
GET /api/worktrees/repositories
GET /api/worktrees/path-preview?repoId=mission-control&taskId=123
GET /api/worktrees/diagnostics?repoId=mission-control&taskId=123
GET /api/worktrees/repositories/mission-control/git
```

A local diagnostic command is also available when dependencies are installed:

```bash
pnpm exec tsx artifacts/api-server/src/scripts/worktree-diagnostics.ts mission-control 123
```

## Intended Lifecycle

1. Create worktree: future phase only; create from an allowlisted repo into the
   configured worktree root after branch/base validation.
2. Assign agent: bind a Mission Control task and agent to the isolated workspace.
3. Run task: launch agent work from the workspace path, not the main checkout.
4. Collect logs: stream stdout/stderr, command events, and task metadata into
   Mission Control.
5. Diff/PR: inspect branch diff, summarize changes, and prepare a pull request.
6. Cleanup: remove task-scoped runtime state, then remove the Git worktree only
   after dirty-state checks and explicit approval where required.

Phase 1 implements only the read-only checks needed before step 1 can be made
safe.
