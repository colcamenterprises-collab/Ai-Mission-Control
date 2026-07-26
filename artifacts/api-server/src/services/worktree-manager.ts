artifacts/api-server/src/routes/orchestrator.ts
import { execFile, spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
  appendFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_REPO_ROOT = "/opt/apps/ai-mission-control";
const DEFAULT_WORKTREE_ROOT =
  "/opt/apps/ai-mission-control/.mission-control/worktrees";
const GIT_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 1024 * 1024;
const ENABLED_VALUES = new Set(["1", "true", "yes", "enabled"]);
const METADATA_FILE_NAME = "mission-control-worktrees.json";
const METADATA_SCHEMA_VERSION = 2;
const AUDIT_FILE_NAME = "mission-control-worktree-audit.jsonl";

const SBB_PRODUCTION_PATH_MARKERS = [
  "/opt/apps/sbb-production",
  "/opt/apps/smash-brothers-burgers",
  "/opt/apps/smash-brothers-burgers-production",
];

export type WorkspacePermissionMode =
  | "read-only"
  | "write-allowed"
  | "execute-allowed"
  | "admin";
export type WorkspaceOperationStatus =
  | "permitted"
  | "blocked"
  | "created"
  | "running"
  | "failed";

export type WorktreeRepositoryConfig = {
  id: string;
  displayName: string;
  rootPath: string;
  defaultBaseBranch: string;
  worktreeRoot: string;
  productionProtected: boolean;
  metadataPath: string;
};

export type OrcaWorkspaceKind = "git" | "folder-workspace";
export type OrcaWorkspaceStatus =
  | "working"
  | "active"
  | "permission"
  | "done"
  | "inactive";

export type WorktreeMeta = {
  displayName: string | null;
  comment: string | null;
  linkedIssue: number | null;
  linkedPR: number | null;
  isArchived: boolean;
  isUnread: boolean;
  sortOrder: number | null;
  lastActivityAt: string | null;
  workspaceStatus: OrcaWorkspaceStatus | null;
};

export type OrcaWorkspace = WorktreeMeta & {
  id: string;
  workspaceKey: string;
  workspaceKind: OrcaWorkspaceKind;
  repoId: string;
  repo: string;
  path: string;
  head: string | null;
  branch: string | null;
  isBare: boolean;
  isMainWorktree: boolean;
  parentWorktreeId: string | null;
  childWorktreeIds: string[];
  lineageDepth: number;
  lineageChildCount: number;
};

export type WorktreeMetadataRecord = {
  id: string;
  repoId: string;
  taskId: string;
  taskName: string | null;
  assignedAgent: string | null;
  permissionMode: WorkspacePermissionMode;
  path: string;
  branchName: string;
  baseBranch: string;
  workspaceKind: OrcaWorkspaceKind;
  createdAt: string | null;
  updatedAt: string | null;
  meta: WorktreeMeta;
};

export type WorktreeMetadataStore = {
  schemaVersion: number;
  records: WorktreeMetadataRecord[];
};

export type WorkspacePathValidation = {
  ok: boolean;
  path: string;
  resolvedPath: string;
  allowedRoot: string | null;
  reason: string | null;
};

export type BranchNameValidation = {
  ok: boolean;
  branchName: string;
  normalizedBranchName: string | null;
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

export type WorktreeCreationRequest = {
  repoId: string;
  taskId: string | number;
  branchName: string;
  baseBranch?: string;
  safetyFlag?: boolean;
  dryRun?: boolean;
  taskName?: string;
  assignedAgent?: string;
  permissionMode?: WorkspacePermissionMode;
  permit?: boolean;
};

export type WorktreeCreationResult = {
  ok: boolean;
  enabled: boolean;
  dryRun: boolean;
  repoId: string;
  taskId: string;
  branchName: string | null;
  baseBranch: string;
  path: string;
  pathValidation: WorkspacePathValidation;
  branchValidation: BranchNameValidation;
  gitStatus: GitStatusInspection | null;
  metadata: WorktreeMetadataRecord | null;
  workspace: OrcaWorkspace | null;
  status: WorkspaceOperationStatus;
  auditId: string | null;
  error: string | null;
};

export type WorktreeCleanupRequest = {
  repoId: string;
  taskId: string | number;
  safetyFlag?: boolean;
  force?: boolean;
  dryRun?: boolean;
  permit?: boolean;
  permissionMode?: WorkspacePermissionMode;
};

export type AgentLaunchRequest = {
  repoId: string;
  taskId: string | number;
  assignedAgent: string;
  permissionMode?: WorkspacePermissionMode;
  permit?: boolean;
  dryRun?: boolean;
  commandArgs?: string[];
};

export type AgentLaunchResult = {
  ok: boolean;
  status: WorkspaceOperationStatus;
  dryRun: boolean;
  repoId: string;
  taskId: string;
  assignedAgent: string;
  workspacePath: string;
  command: string | null;
  result: string | null;
  auditId: string | null;
  error: string | null;
};

const defaultConfiguredRepositories: WorktreeRepositoryConfig[] = [
  {
    id: "mission-control",
    displayName: "Mission Control",
    rootPath: DEFAULT_REPO_ROOT,
    defaultBaseBranch: "main",
    worktreeRoot: DEFAULT_WORKTREE_ROOT,
    productionProtected: false,
    metadataPath: path.join(DEFAULT_WORKTREE_ROOT, METADATA_FILE_NAME),
  },
];

/**
 * Repository inventory is deliberately configuration-backed rather than
 * hardcoded. This keeps Projects truthful: a repository appears only when its
 * server path has been explicitly registered, while its git state is still
 * read live from that path.
 *
 * MISSION_CONTROL_REPOSITORIES accepts a JSON array containing id,
 * displayName, rootPath, defaultBaseBranch?, worktreeRoot? and
 * productionProtected?. Invalid entries are ignored; the Mission Control
 * repository remains available as a safe default.
 */
function configuredRepositories(): WorktreeRepositoryConfig[] {
  const raw = process.env.MISSION_CONTROL_REPOSITORIES?.trim();
  if (!raw) return defaultConfiguredRepositories;
  try {
    const items = JSON.parse(raw) as Array<Partial<WorktreeRepositoryConfig>>;
    if (!Array.isArray(items)) return defaultConfiguredRepositories;
    const repos = items.flatMap((item) => {
      if (!item.id || !item.displayName || !item.rootPath || !path.isAbsolute(item.rootPath)) return [];
      const rootPath = path.normalize(item.rootPath);
      const worktreeRoot = item.worktreeRoot && path.isAbsolute(item.worktreeRoot)
        ? path.normalize(item.worktreeRoot)
        : path.join(rootPath, ".mission-control", "worktrees");
      return [{
        id: item.id,
        displayName: item.displayName,
        rootPath,
        defaultBaseBranch: item.defaultBaseBranch || "main",
        worktreeRoot,
        productionProtected: item.productionProtected ?? false,
        metadataPath: path.join(worktreeRoot, METADATA_FILE_NAME),
      }];
    });
    return repos.length ? repos : defaultConfiguredRepositories;
  } catch {
    return defaultConfiguredRepositories;
  }
}

function createDefaultWorktreeMeta(displayName: string | null): WorktreeMeta {
  return {
    displayName,
    comment: null,
    linkedIssue: null,
    linkedPR: null,
    isArchived: false,
    isUnread: false,
    sortOrder: null,
    lastActivityAt: null,
    workspaceStatus: null,
  };
}

function getWorktreeId(repoId: string, taskId: string): string {
  return `${repoId}:${taskId}`;
}

function getWorkspaceKey(repoId: string, worktreeId: string): string {
  return `git:${repoId}:${worktreeId}`;
}

function metadataStorePath(repo: WorktreeRepositoryConfig): string {
  return normalizeAbsolutePath(repo.metadataPath);
}

function auditStorePath(repo: WorktreeRepositoryConfig): string {
  return normalizeAbsolutePath(path.join(repo.worktreeRoot, AUDIT_FILE_NAME));
}

function normalizeMetadataStore(input: unknown): WorktreeMetadataStore {
  if (!input || typeof input !== "object") {
    return { schemaVersion: METADATA_SCHEMA_VERSION, records: [] };
  }
  const candidate = input as { schemaVersion?: unknown; records?: unknown };
  return {
    schemaVersion:
      typeof candidate.schemaVersion === "number"
        ? candidate.schemaVersion
        : METADATA_SCHEMA_VERSION,
    records: Array.isArray(candidate.records)
      ? candidate.records.filter(
          (record): record is WorktreeMetadataRecord =>
            !!record &&
            typeof record === "object" &&
            typeof (record as WorktreeMetadataRecord).id === "string" &&
            typeof (record as WorktreeMetadataRecord).repoId === "string" &&
            typeof (record as WorktreeMetadataRecord).taskId === "string" &&
            typeof (record as WorktreeMetadataRecord).path === "string" &&
            typeof (record as WorktreeMetadataRecord).branchName === "string" &&
            typeof (record as WorktreeMetadataRecord).baseBranch === "string",
        )
      : [],
  };
}

export async function readWorktreeMetadataStore(
  repoId = "mission-control",
): Promise<WorktreeMetadataStore> {
  const repo = findRepository(repoId);
  try {
    return normalizeMetadataStore(
      JSON.parse(await readFile(metadataStorePath(repo), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: METADATA_SCHEMA_VERSION, records: [] };
    }
    throw error;
  }
}

async function writeWorktreeMetadataStore(
  repo: WorktreeRepositoryConfig,
  store: WorktreeMetadataStore,
): Promise<void> {
  const target = metadataStorePath(repo);
  const validation = validateWorkspacePath(target, [repo.worktreeRoot]);
  if (!validation.ok) {
    throw new Error(validation.reason ?? "Metadata path failed validation");
  }
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  const records = [...store.records].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(
    tmp,
    `${JSON.stringify({ schemaVersion: METADATA_SCHEMA_VERSION, records }, null, 2)}\n`,
    "utf8",
  );
  await rename(tmp, target);
}

function mergeMetadataRecord(
  store: WorktreeMetadataStore,
  record: WorktreeMetadataRecord,
): WorktreeMetadataStore {
  return {
    schemaVersion: METADATA_SCHEMA_VERSION,
    records: [
      ...store.records.filter((candidate) => candidate.id !== record.id),
      record,
    ],
  };
}

async function removeMetadataRecord(
  repo: WorktreeRepositoryConfig,
  worktreeId: string,
): Promise<void> {
  const store = await readWorktreeMetadataStore(repo.id);
  await writeWorktreeMetadataStore(repo, {
    schemaVersion: METADATA_SCHEMA_VERSION,
    records: store.records.filter((record) => record.id !== worktreeId),
  });
}

function normalizeAbsolutePath(input: string): string {
  return path.resolve(input);
}

function pathInsideRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function envEnabled(name: string): boolean {
  return ENABLED_VALUES.has((process.env[name] ?? "").trim().toLowerCase());
}

function normalizePermissionMode(
  mode: WorkspacePermissionMode | undefined,
): WorkspacePermissionMode {
  if (
    mode === "read-only" ||
    mode === "write-allowed" ||
    mode === "execute-allowed" ||
    mode === "admin"
  ) {
    return mode;
  }
  return "read-only";
}

function permissionAllows(
  mode: WorkspacePermissionMode,
  operation: "create" | "execute" | "cleanup",
): boolean {
  if (operation === "create") {
    return (
      mode === "write-allowed" || mode === "execute-allowed" || mode === "admin"
    );
  }
  if (operation === "execute") {
    return mode === "execute-allowed" || mode === "admin";
  }
  return mode === "admin";
}

function explicitPermit(request: {
  safetyFlag?: boolean;
  permit?: boolean;
}): boolean {
  return request.permit === true || request.safetyFlag === true;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function writeAuditLog(
  repo: WorktreeRepositoryConfig,
  entry: Record<string, unknown>,
): Promise<string> {
  const target = auditStorePath(repo);
  const validation = validateWorkspacePath(target, [repo.worktreeRoot]);
  if (!validation.ok) {
    throw new Error(validation.reason ?? "Audit path failed validation");
  }
  await mkdir(path.dirname(target), { recursive: true });
  const auditId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await appendFile(
    target,
    `${JSON.stringify({ auditId, at: nowIso(), ...entry })}\n`,
    "utf8",
  );
  return auditId;
}

const agentRegistry: Record<string, { command: string; args: string[] }> = {
  james: { command: process.env.JAMES_AGENT_COMMAND ?? "james", args: [] },
  codex: { command: process.env.CODEX_AGENT_COMMAND ?? "codex", args: [] },
};

function resolveAgent(
  agentId: string,
): { command: string; args: string[] } | null {
  const normalized = agentId.trim().toLowerCase();
  if (!normalized) return null;
  const envCommand = process.env[`AGENT_${normalized.toUpperCase()}_COMMAND`];
  if (envCommand) return { command: envCommand, args: [] };
  return agentRegistry[normalized] ?? null;
}

function getAllowedWorkspaceRoots(): string[] {
  return configuredRepositories().flatMap((repo) => [
    normalizeAbsolutePath(repo.rootPath),
    normalizeAbsolutePath(repo.worktreeRoot),
  ]);
}

function findRepository(repoId: string): WorktreeRepositoryConfig {
  const repo = configuredRepositories().find(
    (candidate) => candidate.id === repoId,
  );
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
): Promise<
  { ok: true; stdout: string; stderr: string } | { ok: false; error: string }
> {
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

function parsePorcelainWorktreeList(
  output: string,
): GitWorktreeInspection["worktrees"] {
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
  return configuredRepositories().map((repo) => ({ ...repo }));
}

export function validateBranchName(branchName: string): BranchNameValidation {
  const normalizedBranchName = branchName.trim();
  if (!normalizedBranchName) {
    return {
      ok: false,
      branchName,
      normalizedBranchName: null,
      reason: "branchName is required",
    };
  }
  if (normalizedBranchName.length > 120) {
    return {
      ok: false,
      branchName,
      normalizedBranchName,
      reason: "branchName is too long",
    };
  }
  if (
    normalizedBranchName.startsWith("-") ||
    normalizedBranchName.startsWith("/") ||
    normalizedBranchName.endsWith("/") ||
    normalizedBranchName.includes("..") ||
    normalizedBranchName.includes("@{") ||
    /[\\\s~^:?*[\]\x00-\x1f\x7f]/.test(normalizedBranchName) ||
    /(^|\/)\.(\.?)(\/|$)/.test(normalizedBranchName) ||
    /\.lock$/.test(normalizedBranchName)
  ) {
    return {
      ok: false,
      branchName,
      normalizedBranchName,
      reason: "branchName is not a safe Git branch name",
    };
  }

  return { ok: true, branchName, normalizedBranchName, reason: null };
}

export function calculateSafeWorktreePath(
  repoId: string,
  taskId: string | number,
): WorktreePathPreview {
  const repo = findRepository(repoId);
  const safeTaskId = sanitizeTaskId(taskId);
  const directoryName = `${repo.id}-task-${safeTaskId}`;
  const candidatePath = normalizeAbsolutePath(
    path.join(repo.worktreeRoot, directoryName),
  );
  const validation = validateTargetWorktreePath(repo.id, candidatePath);

  if (!validation.ok) {
    throw new Error(
      validation.reason ?? "Calculated worktree path failed validation",
    );
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

export function validateTargetWorktreePath(
  repoId: string,
  targetPath: string,
): WorkspacePathValidation {
  const repo = findRepository(repoId);
  const validation = validateWorkspacePath(targetPath, [repo.worktreeRoot]);
  if (!validation.ok) return validation;

  const protectedPath = SBB_PRODUCTION_PATH_MARKERS.map(
    normalizeAbsolutePath,
  ).find((blocked) => pathInsideRoot(validation.resolvedPath, blocked));
  if (repo.productionProtected || protectedPath) {
    return {
      ...validation,
      ok: false,
      reason: "Target path is protected from SBB production writes",
    };
  }

  return validation;
}

export async function inspectGitStatus(
  repoId: string,
  workspacePath?: string,
): Promise<GitStatusInspection> {
  const repo = findRepository(repoId);
  const rootPath = normalizeAbsolutePath(workspacePath ?? repo.rootPath);
  const validation = validateWorkspacePath(rootPath, [
    repo.rootPath,
    repo.worktreeRoot,
  ]);

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

export async function listOrcaWorkspaces(
  repoId = "mission-control",
): Promise<OrcaWorkspace[]> {
  const repo = findRepository(repoId);
  const [metadata, inspection] = await Promise.all([
    readWorktreeMetadataStore(repo.id),
    inspectGitWorktreeAvailability(repo.id),
  ]);
  const metadataByPath = new Map(
    metadata.records.map((record) => [
      normalizeAbsolutePath(record.path),
      record,
    ]),
  );

  return inspection.worktrees.map((worktree) => {
    const normalizedPath = normalizeAbsolutePath(worktree.path);
    const record = metadataByPath.get(normalizedPath);
    const id = record?.id ?? `${repo.id}:${path.basename(normalizedPath)}`;
    const isMainWorktree =
      normalizeAbsolutePath(repo.rootPath) === normalizedPath;
    const meta =
      record?.meta ?? createDefaultWorktreeMeta(path.basename(normalizedPath));

    return {
      ...meta,
      id,
      workspaceKey: getWorkspaceKey(repo.id, id),
      workspaceKind: record?.workspaceKind ?? "git",
      repoId: repo.id,
      repo: repo.displayName,
      path: normalizedPath,
      head: worktree.head,
      branch: worktree.branch,
      isBare: false,
      isMainWorktree,
      parentWorktreeId: null,
      childWorktreeIds: [],
      lineageDepth: 0,
      lineageChildCount: 0,
    };
  });
}

export async function createTaskWorktree(
  request: WorktreeCreationRequest,
): Promise<WorktreeCreationResult> {
  const repo = findRepository(request.repoId);
  const pathPreview = calculateSafeWorktreePath(repo.id, request.taskId);
  const branchValidation = validateBranchName(request.branchName);
  const baseBranch = request.baseBranch?.trim() || repo.defaultBaseBranch;
  const dryRun = request.dryRun === true;
  const permissionMode = normalizePermissionMode(request.permissionMode);
  const enabled =
    envEnabled("WORKTREE_CREATION_ENABLED") &&
    explicitPermit(request) &&
    permissionAllows(permissionMode, "create");

  const baseResult = {
    enabled,
    dryRun,
    repoId: repo.id,
    taskId: pathPreview.taskId,
    branchName: branchValidation.normalizedBranchName,
    baseBranch,
    path: pathPreview.path,
    pathValidation: pathPreview.validation,
    branchValidation,
    metadata: null,
    workspace: null,
    status: enabled || dryRun ? ("permitted" as const) : ("blocked" as const),
    auditId: null,
  };

  if (!branchValidation.ok) {
    return {
      ...baseResult,
      ok: false,
      gitStatus: null,
      error: branchValidation.reason,
    };
  }
  if (!enabled && !dryRun) {
    const auditId = await writeAuditLog(repo, {
      action: "workspace.create",
      status: "blocked",
      requestedBy: "api",
      repoId: repo.id,
      branchName: branchValidation.normalizedBranchName,
      workspacePath: pathPreview.path,
      permissionMode,
      command: null,
      result: "blocked",
      reason: !permissionAllows(permissionMode, "create")
        ? "permission mode does not allow workspace creation"
        : "missing environment gate or explicit permit",
    });
    return {
      ...baseResult,
      ok: false,
      status: "blocked",
      auditId,
      gitStatus: null,
      error:
        "Worktree creation requires WORKTREE_CREATION_ENABLED, an explicit permit, and write-allowed/execute-allowed/admin permission mode.",
    };
  }
  if (dryRun) {
    const auditId = await writeAuditLog(repo, {
      action: "workspace.create",
      status: "permitted",
      dryRun,
      requestedBy: "api",
      repoId: repo.id,
      branchName: branchValidation.normalizedBranchName,
      workspacePath: pathPreview.path,
      permissionMode,
      command: null,
      result: "dry-run",
    });
    return {
      ...baseResult,
      ok: true,
      status: "permitted",
      auditId,
      gitStatus: null,
      error: null,
    };
  }

  const result = await runGit(repo.rootPath, [
    "worktree",
    "add",
    "-b",
    branchValidation.normalizedBranchName!,
    pathPreview.path,
    baseBranch,
  ]);
  if (!result.ok) {
    const auditId = await writeAuditLog(repo, {
      action: "workspace.create",
      status: "failed",
      requestedBy: "api",
      repoId: repo.id,
      branchName: branchValidation.normalizedBranchName,
      workspacePath: pathPreview.path,
      permissionMode,
      command: `git worktree add -b ${branchValidation.normalizedBranchName} ${pathPreview.path} ${baseBranch}`,
      result: result.error,
    });
    return {
      ...baseResult,
      ok: false,
      status: "failed",
      auditId,
      gitStatus: null,
      error: result.error,
    };
  }

  const metadata: WorktreeMetadataRecord = {
    id: getWorktreeId(repo.id, pathPreview.taskId),
    repoId: repo.id,
    taskId: pathPreview.taskId,
    taskName: request.taskName?.trim() || null,
    assignedAgent: request.assignedAgent?.trim() || null,
    permissionMode,
    path: pathPreview.path,
    branchName: branchValidation.normalizedBranchName!,
    baseBranch,
    workspaceKind: "git",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    meta: createDefaultWorktreeMeta(pathPreview.taskId),
  };
  await writeWorktreeMetadataStore(
    repo,
    mergeMetadataRecord(await readWorktreeMetadataStore(repo.id), metadata),
  );
  const workspace =
    (await listOrcaWorkspaces(repo.id)).find(
      (candidate) => candidate.id === metadata.id,
    ) ?? null;

  const auditId = await writeAuditLog(repo, {
    action: "workspace.create",
    status: "created",
    requestedBy: "api",
    repoId: repo.id,
    branchName: metadata.branchName,
    workspacePath: metadata.path,
    permissionMode,
    assignedAgent: metadata.assignedAgent,
    command: `git worktree add -b ${metadata.branchName} ${metadata.path} ${baseBranch}`,
    result: "created",
  });

  return {
    ...baseResult,
    ok: true,
    status: "created",
    auditId,
    gitStatus: await inspectGitStatus(repo.id, pathPreview.path),
    metadata,
    workspace,
    error: null,
  };
}

export async function cleanupTaskWorktree(
  request: WorktreeCleanupRequest,
): Promise<WorktreeCreationResult> {
  const repo = findRepository(request.repoId);
  const pathPreview = calculateSafeWorktreePath(repo.id, request.taskId);
  const branchValidation = validateBranchName(`cleanup/${pathPreview.taskId}`);
  const dryRun = request.dryRun === true;
  const permissionMode = normalizePermissionMode(request.permissionMode);
  const enabled =
    envEnabled("WORKTREE_CLEANUP_ENABLED") &&
    explicitPermit(request) &&
    permissionAllows(permissionMode, "cleanup");
  const baseResult = {
    enabled,
    dryRun,
    repoId: repo.id,
    taskId: pathPreview.taskId,
    branchName: null,
    baseBranch: repo.defaultBaseBranch,
    path: pathPreview.path,
    pathValidation: pathPreview.validation,
    branchValidation,
    metadata: null,
    workspace: null,
    status: enabled || dryRun ? ("permitted" as const) : ("blocked" as const),
    auditId: null,
  };

  if (!enabled && !dryRun) {
    const auditId = await writeAuditLog(repo, {
      action: "workspace.cleanup",
      status: "blocked",
      requestedBy: "api",
      repoId: repo.id,
      branchName: null,
      workspacePath: pathPreview.path,
      permissionMode,
      command: null,
      result: "blocked",
    });
    return {
      ...baseResult,
      ok: false,
      status: "blocked",
      auditId,
      gitStatus: null,
      error:
        "Worktree cleanup requires WORKTREE_CLEANUP_ENABLED, an explicit permit, and admin permission mode.",
    };
  }

  const gitStatus = await inspectGitStatus(repo.id, pathPreview.path);
  if (dryRun) {
    const auditId = await writeAuditLog(repo, {
      action: "workspace.cleanup",
      status: "permitted",
      dryRun,
      requestedBy: "api",
      repoId: repo.id,
      branchName: null,
      workspacePath: pathPreview.path,
      permissionMode,
      command: null,
      result: "dry-run",
    });
    return {
      ...baseResult,
      ok: true,
      status: "permitted",
      auditId,
      gitStatus,
      error: null,
    };
  }
  if (gitStatus.dirty && request.force !== true) {
    return {
      ...baseResult,
      ok: false,
      gitStatus,
      error: "Refusing to remove dirty worktree without force=true.",
    };
  }

  const remove = await runGit(repo.rootPath, [
    "worktree",
    "remove",
    ...(request.force === true ? ["--force"] : []),
    pathPreview.path,
  ]);
  if (!remove.ok) {
    const auditId = await writeAuditLog(repo, {
      action: "workspace.cleanup",
      status: "failed",
      requestedBy: "api",
      repoId: repo.id,
      branchName: null,
      workspacePath: pathPreview.path,
      permissionMode,
      command: `git worktree remove ${pathPreview.path}`,
      result: remove.error,
    });
    return {
      ...baseResult,
      ok: false,
      status: "failed",
      auditId,
      gitStatus,
      error: remove.error,
    };
  }
  await rm(pathPreview.path, { recursive: true, force: true });
  await removeMetadataRecord(repo, getWorktreeId(repo.id, pathPreview.taskId));
  const auditId = await writeAuditLog(repo, {
    action: "workspace.cleanup",
    status: "created",
    requestedBy: "api",
    repoId: repo.id,
    branchName: null,
    workspacePath: pathPreview.path,
    permissionMode,
    command: `git worktree remove ${pathPreview.path}`,
    result: "removed",
  });
  return {
    ...baseResult,
    ok: true,
    status: "created",
    auditId,
    gitStatus,
    error: null,
  };
}

export async function launchWorkspaceAgent(
  request: AgentLaunchRequest,
): Promise<AgentLaunchResult> {
  const repo = findRepository(request.repoId);
  const pathPreview = calculateSafeWorktreePath(repo.id, request.taskId);
  const permissionMode = normalizePermissionMode(request.permissionMode);
  const dryRun = request.dryRun === true;
  const agent = resolveAgent(request.assignedAgent);
  const pathValidation = validateTargetWorktreePath(repo.id, pathPreview.path);
  const commandArgs = Array.isArray(request.commandArgs)
    ? request.commandArgs.filter(
        (arg): arg is string => typeof arg === "string",
      )
    : [];
  const base = {
    dryRun,
    repoId: repo.id,
    taskId: pathPreview.taskId,
    assignedAgent: request.assignedAgent,
    workspacePath: pathPreview.path,
    command: agent
      ? [agent.command, ...agent.args, ...commandArgs].join(" ")
      : null,
    result: null,
    auditId: null,
  };

  if (
    !agent ||
    !pathValidation.ok ||
    !explicitPermit(request) ||
    !permissionAllows(permissionMode, "execute")
  ) {
    const auditId = await writeAuditLog(repo, {
      action: "agent.launch",
      status: "blocked",
      requestedBy: "api",
      repoId: repo.id,
      branchName: null,
      workspacePath: pathPreview.path,
      permissionMode,
      assignedAgent: request.assignedAgent,
      command: base.command,
      result: "blocked",
      reason: !agent
        ? "unknown agent"
        : !pathValidation.ok
          ? pathValidation.reason
          : !explicitPermit(request)
            ? "missing explicit permit"
            : "permission mode does not allow execution",
    });
    return {
      ...base,
      ok: false,
      status: "blocked",
      auditId,
      error:
        "Agent launch requires a registered agent, explicit permit, execute-allowed/admin permission mode, and a managed workspace path.",
    };
  }

  if (dryRun) {
    const auditId = await writeAuditLog(repo, {
      action: "agent.launch",
      status: "permitted",
      dryRun,
      requestedBy: "api",
      repoId: repo.id,
      branchName: null,
      workspacePath: pathPreview.path,
      permissionMode,
      assignedAgent: request.assignedAgent,
      command: base.command,
      result: "dry-run",
    });
    return {
      ...base,
      ok: true,
      status: "permitted",
      auditId,
      result: "dry-run",
      error: null,
    };
  }

  try {
    const child = spawn(agent.command, [...agent.args, ...commandArgs], {
      cwd: pathPreview.path,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    const auditId = await writeAuditLog(repo, {
      action: "agent.launch",
      status: "running",
      requestedBy: "api",
      repoId: repo.id,
      branchName: null,
      workspacePath: pathPreview.path,
      permissionMode,
      assignedAgent: request.assignedAgent,
      command: base.command,
      result: `pid:${child.pid ?? "unknown"}`,
    });
    return {
      ...base,
      ok: true,
      status: "running",
      auditId,
      result: `pid:${child.pid ?? "unknown"}`,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "agent launch failed";
    const auditId = await writeAuditLog(repo, {
      action: "agent.launch",
      status: "failed",
      requestedBy: "api",
      repoId: repo.id,
      branchName: null,
      workspacePath: pathPreview.path,
      permissionMode,
      assignedAgent: request.assignedAgent,
      command: base.command,
      result: message,
    });
    return {
      ...base,
      ok: false,
      status: "failed",
      auditId,
      result: message,
      error: message,
    };
  }
}

export async function getWorktreeDiagnostics(
  repoId: string,
  taskId: string | number,
) {
  const repo = findRepository(repoId);
  const [status, worktree, metadata, workspaces] = await Promise.all([
    inspectGitStatus(repo.id),
    inspectGitWorktreeAvailability(repo.id),
    readWorktreeMetadataStore(repo.id),
    listOrcaWorkspaces(repo.id),
  ]);

  return {
    repository: repo,
    pathPreview: calculateSafeWorktreePath(repo.id, taskId),
    git: status,
    worktree,
    metadata,
    workspaces,
    creation: {
      enabled: envEnabled("WORKTREE_CREATION_ENABLED"),
      requiresSafetyFlag: true,
      reason:
        "Worktree creation is disabled by default and requires WORKTREE_CREATION_ENABLED plus an explicit safety flag.",
    },
    cleanup: {
      enabled: envEnabled("WORKTREE_CLEANUP_ENABLED"),
      requiresSafetyFlag: true,
      reason:
        "Worktree cleanup is disabled by default and requires WORKTREE_CLEANUP_ENABLED plus an explicit safety flag.",
    },
  };
}

export function createWorktreeDisabled(): never {
  throw new Error(
    "Worktree creation is disabled unless the lifecycle safety gates are explicitly enabled.",
  );
}
