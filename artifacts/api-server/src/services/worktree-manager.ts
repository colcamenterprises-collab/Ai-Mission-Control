import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_REPO_ROOT = "/opt/apps/ai-mission-control";
const DEFAULT_WORKTREE_ROOT =
  "/opt/apps/ai-mission-control/.mission-control/worktrees";
const GIT_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 1024 * 1024;

export type WorktreeRepositoryConfig = {
  id: string;
  displayName: string;
  rootPath: string;
  defaultBaseBranch: string;
  worktreeRoot: string;
  productionProtected: boolean;
};

export type WorkspacePathValidation = {
  ok: boolean;
  path: string;
  resolvedPath: string;
  allowedRoot: string | null;
  reason: string | null;
};

export type GitStatusInspection = {
  repoId: string;
  ok: boolean;
  rootPath: string;
  branch: string | null;
  head: string | null;
  statusLines: string[];
  dirty: boolean;
  error: string | null;
};

export type GitWorktreeInspection = {
  repoId: string;
  ok: boolean;
  available: boolean;
  rootPath: string;
  worktreeCount: number;
  worktrees: Array<{
    path: string;
    head: string | null;
    branch: string | null;
  }>;
  error: string | null;
};

export type WorktreePathPreview = {
  repoId: string;
  taskId: string;
  directoryName: string;
  path: string;
  validation: WorkspacePathValidation;
};

const configuredRepositories: WorktreeRepositoryConfig[] = [
  {
    id: "mission-control",
    displayName: "Mission Control",
    rootPath: DEFAULT_REPO_ROOT,
    defaultBaseBranch: "main",
    worktreeRoot: DEFAULT_WORKTREE_ROOT,
    productionProtected: false,
  },
];

function normalizeAbsolutePath(input: string): string {
  return path.resolve(input);
}

function pathInsideRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function getAllowedWorkspaceRoots(): string[] {
  return configuredRepositories.flatMap((repo) => [
    normalizeAbsolutePath(repo.rootPath),
    normalizeAbsolutePath(repo.worktreeRoot),
  ]);
}

function findRepository(repoId: string): WorktreeRepositoryConfig {
  const repo = configuredRepositories.find((candidate) => candidate.id === repoId);
  if (!repo) {
    throw new Error(`Unknown worktree repository: ${repoId}`);
  }
  return repo;
}

function sanitizeTaskId(taskId: string | number): string {
  const raw = String(taskId).trim().toLowerCase();
  const sanitized = raw
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 64);

  if (!sanitized) {
    throw new Error("taskId must contain at least one safe path character");
  }

  return sanitized;
}

async function getRealPathIfPresent(input: string): Promise<string | null> {
  try {
    return await realpath(input);
  } catch {
    return null;
  }
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<{ ok: true; stdout: string; stderr: string } | { ok: false; error: string }> {
  try {
    const result = await execFileAsync("git", ["-C", cwd, ...args], {
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "git command failed",
    };
  }
}

function parsePorcelainWorktreeList(output: string): GitWorktreeInspection["worktrees"] {
  const worktrees: GitWorktreeInspection["worktrees"] = [];
  let current: GitWorktreeInspection["worktrees"][number] | null = null;

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) {
        worktrees.push(current);
        current = null;
      }
      continue;
    }

    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");
    if (key === "worktree") {
      if (current) worktrees.push(current);
      current = { path: value, head: null, branch: null };
    } else if (key === "HEAD" && current) {
      current.head = value || null;
    } else if (key === "branch" && current) {
      current.branch = value.replace(/^refs\/heads\//, "") || null;
    }
  }

  if (current) {
    worktrees.push(current);
  }

  return worktrees;
}

export function listConfiguredWorktreeRepositories(): WorktreeRepositoryConfig[] {
  return configuredRepositories.map((repo) => ({ ...repo }));
}

export function calculateSafeWorktreePath(
  repoId: string,
  taskId: string | number,
): WorktreePathPreview {
  const repo = findRepository(repoId);
  const safeTaskId = sanitizeTaskId(taskId);
  const directoryName = `${repo.id}-task-${safeTaskId}`;
  const candidatePath = normalizeAbsolutePath(path.join(repo.worktreeRoot, directoryName));
  const validation = validateWorkspacePath(candidatePath, [repo.worktreeRoot]);

  if (!validation.ok) {
    throw new Error(validation.reason ?? "Calculated worktree path failed validation");
  }

  return {
    repoId: repo.id,
    taskId: safeTaskId,
    directoryName,
    path: candidatePath,
    validation,
  };
}

export function validateWorkspacePath(
  workspacePath: string,
  allowedRoots = getAllowedWorkspaceRoots(),
): WorkspacePathValidation {
  const resolvedPath = normalizeAbsolutePath(workspacePath);
  const normalizedRoots = allowedRoots.map(normalizeAbsolutePath);
  const allowedRoot =
    normalizedRoots.find((root) => pathInsideRoot(resolvedPath, root)) ?? null;

  if (!allowedRoot) {
    return {
      ok: false,
      path: workspacePath,
      resolvedPath,
      allowedRoot: null,
      reason: "Path is outside the configured worktree allowlist",
    };
  }

  return {
    ok: true,
    path: workspacePath,
    resolvedPath,
    allowedRoot,
    reason: null,
  };
}

export async function inspectGitStatus(repoId: string): Promise<GitStatusInspection> {
  const repo = findRepository(repoId);
  const rootPath = normalizeAbsolutePath(repo.rootPath);
  const validation = validateWorkspacePath(rootPath, [repo.rootPath]);

  if (!validation.ok) {
    return {
      repoId,
      ok: false,
      rootPath,
      branch: null,
      head: null,
      statusLines: [],
      dirty: false,
      error: validation.reason,
    };
  }

  const realRoot = (await getRealPathIfPresent(rootPath)) ?? rootPath;
  const branch = await runGit(realRoot, ["branch", "--show-current"]);
  const head = await runGit(realRoot, ["rev-parse", "--short", "HEAD"]);
  const status = await runGit(realRoot, ["status", "--short", "--branch"]);

  if (!status.ok) {
    return {
      repoId,
      ok: false,
      rootPath: realRoot,
      branch: branch.ok ? branch.stdout.trim() || null : null,
      head: head.ok ? head.stdout.trim() || null : null,
      statusLines: [],
      dirty: false,
      error: status.error,
    };
  }

  const statusLines = status.stdout.split(/\r?\n/).filter(Boolean);
  return {
    repoId,
    ok: true,
    rootPath: realRoot,
    branch: branch.ok ? branch.stdout.trim() || null : null,
    head: head.ok ? head.stdout.trim() || null : null,
    statusLines,
    dirty: statusLines.some((line) => !line.startsWith("##")),
    error: null,
  };
}

export async function inspectGitWorktreeAvailability(
  repoId: string,
): Promise<GitWorktreeInspection> {
  const repo = findRepository(repoId);
  const rootPath = normalizeAbsolutePath(repo.rootPath);
  const validation = validateWorkspacePath(rootPath, [repo.rootPath]);

  if (!validation.ok) {
    return {
      repoId,
      ok: false,
      available: false,
      rootPath,
      worktreeCount: 0,
      worktrees: [],
      error: validation.reason,
    };
  }

  const realRoot = (await getRealPathIfPresent(rootPath)) ?? rootPath;
  const result = await runGit(realRoot, ["worktree", "list", "--porcelain"]);
  if (!result.ok) {
    return {
      repoId,
      ok: false,
      available: false,
      rootPath: realRoot,
      worktreeCount: 0,
      worktrees: [],
      error: result.error,
    };
  }

  const worktrees = parsePorcelainWorktreeList(result.stdout);
  return {
    repoId,
    ok: true,
    available: true,
    rootPath: realRoot,
    worktreeCount: worktrees.length,
    worktrees,
    error: null,
  };
}

export async function getWorktreeDiagnostics(repoId: string, taskId: string | number) {
  const repo = findRepository(repoId);
  const [status, worktree] = await Promise.all([
    inspectGitStatus(repo.id),
    inspectGitWorktreeAvailability(repo.id),
  ]);

  return {
    repository: repo,
    pathPreview: calculateSafeWorktreePath(repo.id, taskId),
    git: status,
    worktree,
    creation: {
      enabled: false,
      reason: "Phase 1 is diagnostics-only; worktree creation is intentionally disabled.",
    },
  };
}

export function createWorktreeDisabled(): never {
  throw new Error("Worktree creation is disabled in Orca Phase 1.");
}
