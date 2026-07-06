import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  BadgeCheck,
  Boxes,
  GitBranch,
  GitCommit,
  Hammer,
  Loader2,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import "./workspaces.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() ?? "").replace(
  /\/$/,
  "",
);
const SAFETY_GATED_REASON = "Coming next / safety gated";
const ADMIN_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_ADMIN_TOKEN_STORAGE_KEY = "MISSION_CONTROL_ADMIN_TOKEN";
const MVP_FALLBACK_ADMIN_TOKEN = "change-this-later";
const DEFAULT_DIAGNOSTICS_TASK_ID = "20";

const AGENT_ROLES = [
  {
    name: "James",
    role: "Orchestrator",
    brief: "Plans, routes, coordinates, and reports before any future action.",
  },
  {
    name: "Scout",
    role: "Research",
    brief: "Gathers source-backed context and returns structured briefs.",
  },
  {
    name: "Scribe",
    role: "Documentation/content",
    brief: "Turns validated work into docs, notes, and content drafts.",
  },
  {
    name: "Reach",
    role: "Marketing/outreach",
    brief:
      "Prepares campaign and audience outreach materials from approved briefs.",
  },
  {
    name: "Dev/Codex",
    role: "Build agent",
    brief: "Implements scoped build tasks after an explicit plan is approved.",
  },
] as const;

const OPERATING_RULES = [
  "Show plan before action.",
  "Give progress updates on multi-step tasks.",
  "Never go silent during long tasks.",
  "Delegate with structured briefs, not raw chat.",
  "Report failures clearly.",
  "Never fabricate results.",
] as const;

type WorktreeRepository = {
  id: string;
  displayName: string;
  rootPath: string;
  defaultBaseBranch: string;
  worktreeRoot: string;
  productionProtected: boolean;
  metadataPath: string;
};

type OrcaWorkspace = {
  id: string;
  workspaceKey: string;
  workspaceKind: "git" | "folder-workspace";
  repoId: string;
  repo: string;
  path: string;
  head: string | null;
  branch: string | null;
  isBare: boolean;
  isMainWorktree: boolean;
  displayName: string | null;
  comment: string | null;
  isArchived: boolean;
  isUnread: boolean;
  workspaceStatus: string | null;
  lastActivityAt: string | null;
};

type WorktreeRepositoriesResponse = {
  repositories: WorktreeRepository[];
};

type WorktreeWorkspacesResponse = {
  metadata: {
    schemaVersion: number;
    records: Array<unknown>;
  };
  workspaces: OrcaWorkspace[];
};

type AdminToken = {
  source: "localStorage" | "env" | "fallback";
  value: string;
};

type WorktreeDiagnosticsResponse = {
  repository: WorktreeRepository;
  git: {
    ok: boolean;
    branch: string | null;
    head: string | null;
    statusLines: string[];
    dirty: boolean;
    error: string | null;
  };
  worktree: {
    ok: boolean;
    available: boolean;
    worktreeCount: number;
    error: string | null;
  };
  creation: {
    enabled: boolean;
    requiresSafetyFlag: boolean;
    reason: string;
  };
  cleanup: {
    enabled: boolean;
    requiresSafetyFlag: boolean;
    reason: string;
  };
  metadata: {
    schemaVersion: number;
    records: Array<unknown>;
  };
};

class WorkspacesApiError extends Error {
  readonly endpoint: string;
  readonly status?: number;
  readonly backendMessage?: string;

  constructor({
    message,
    endpoint,
    status,
    backendMessage,
  }: {
    message: string;
    endpoint: string;
    status?: number;
    backendMessage?: string;
  }) {
    super(message);
    this.name = "WorkspacesApiError";
    this.endpoint = endpoint;
    this.status = status;
    this.backendMessage = backendMessage;
  }
}

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function readAdminToken(): AdminToken {
  const storedToken =
    localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ||
    localStorage.getItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY)?.trim();
  if (storedToken) return { source: "localStorage", value: storedToken };

  const envToken = import.meta.env.VITE_MISSION_CONTROL_ADMIN_TOKEN?.trim();
  if (envToken) return { source: "env", value: envToken };

  return { source: "fallback", value: MVP_FALLBACK_ADMIN_TOKEN };
}

function authHeaders(): HeadersInit {
  const token = readAdminToken();
  return { Authorization: `Bearer ${token.value}` };
}

function extractBackendMessage(
  data: unknown,
  fallback?: string,
): string | undefined {
  if (data !== null && typeof data === "object") {
    if ("error" in data && typeof data.error === "string") return data.error;
    if ("message" in data && typeof data.message === "string")
      return data.message;
    if ("details" in data && typeof data.details === "string")
      return data.details;
  }

  return fallback?.trim() || undefined;
}

async function parseJsonResponse(
  response: Response,
  endpoint: string,
): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new WorkspacesApiError({
      message: `Invalid JSON from ${endpoint}: ${
        error instanceof Error ? error.message : "Unable to parse response"
      }`,
      endpoint,
      status: response.status,
      backendMessage: text.slice(0, 300),
    });
  }
}

function ensureArray(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : [];
}

function normalizeWorkspacesResponse(
  data: WorktreeWorkspacesResponse,
): WorktreeWorkspacesResponse {
  return {
    ...data,
    metadata: {
      schemaVersion: data.metadata?.schemaVersion ?? 0,
      records: ensureArray(data.metadata?.records),
    },
    workspaces: Array.isArray(data.workspaces) ? data.workspaces : [],
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const endpoint = apiUrl(path);
  let response: Response;

  try {
    response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        ...authHeaders(),
      },
      credentials: "same-origin",
    });
  } catch (error) {
    throw new WorkspacesApiError({
      message:
        error instanceof Error ? error.message : `Unable to reach ${endpoint}`,
      endpoint,
    });
  }

  const data = await parseJsonResponse(response, endpoint);

  if (!response.ok) {
    const backendMessage = extractBackendMessage(data, response.statusText);
    throw new WorkspacesApiError({
      message: backendMessage || `Request failed with HTTP ${response.status}`,
      endpoint,
      status: response.status,
      backendMessage,
    });
  }

  return data as T;
}

function formatWorkspacesError(error: unknown): string {
  if (error instanceof WorkspacesApiError) {
    return [
      error.status ? `Status: ${error.status}` : "Status: network/unknown",
      `Endpoint: ${error.endpoint}`,
      `Message: ${error.backendMessage || error.message}`,
    ].join(" · ");
  }

  return error instanceof Error
    ? error.message
    : "Unknown workspaces API error";
}

function shortCommit(head: string | null): string {
  return head ? head.slice(0, 12) : "unknown";
}

function statusLabel(workspace: OrcaWorkspace): "Clean" | "Dirty" | "Unknown" {
  if (workspace.workspaceStatus === "working") return "Dirty";
  if (workspace.isMainWorktree) return "Unknown";
  return "Clean";
}

function DisabledActionButton({
  label,
  icon: Icon,
}: {
  label: string;
  icon: typeof Plus;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled
      title={SAFETY_GATED_REASON}
      aria-label={`${label}: ${SAFETY_GATED_REASON}`}
      className="safety-gated-button justify-start gap-2"
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span className="sr-only">{SAFETY_GATED_REASON}</span>
    </Button>
  );
}

export default function Workspaces() {
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);

  const repositoriesQuery = useQuery({
    queryKey: ["worktrees", "repositories"],
    queryFn: () =>
      fetchJson<WorktreeRepositoriesResponse>("/api/worktrees/repositories"),
  });

  const workspacesQuery = useQuery({
    queryKey: ["worktrees", "workspaces"],
    queryFn: async () =>
      normalizeWorkspacesResponse(
        await fetchJson<WorktreeWorkspacesResponse>(
          "/api/worktrees/workspaces",
        ),
      ),
  });

  const diagnosticsRepoId = selectedRepoId ?? "mission-control";
  const diagnosticsQuery = useQuery({
    queryKey: [
      "worktrees",
      "diagnostics",
      diagnosticsRepoId,
      DEFAULT_DIAGNOSTICS_TASK_ID,
    ],
    queryFn: () =>
      fetchJson<WorktreeDiagnosticsResponse>(
        `/api/worktrees/diagnostics?repoId=${encodeURIComponent(
          diagnosticsRepoId,
        )}&taskId=${DEFAULT_DIAGNOSTICS_TASK_ID}`,
      ),
    enabled: Boolean(diagnosticsRepoId),
  });

  const repositories = repositoriesQuery.data?.repositories ?? [];
  const workspaces = workspacesQuery.data?.workspaces ?? [];

  useEffect(() => {
    if (selectedRepoId || repositories.length === 0) return;

    const missionControlRepo = repositories.find(
      (repo) => repo.id === "mission-control",
    );
    setSelectedRepoId((missionControlRepo ?? repositories[0]).id);
  }, [repositories, selectedRepoId]);
  const mainWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.isMainWorktree),
    [workspaces],
  );
  const selectedRepository = repositories.find(
    (repo) => repo.id === selectedRepoId,
  );
  const creation = diagnosticsQuery.data?.creation;
  const cleanup = diagnosticsQuery.data?.cleanup;

  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <header className="workspaces-page-header">
          <div className="workspace-status-strip" aria-label="Workspace status">
            <span className="workspace-status-pill">
              <span className="status-dot" /> All systems operational
            </span>
            <span className="workspace-status-pill">
              Active agent: James / Orchestrator
            </span>
            <span className="workspace-status-pill">
              Session: live telemetry
            </span>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            <h1 className="font-mono text-2xl font-semibold uppercase tracking-tight">
              Workspaces
            </h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Read-only visibility into live repositories, worktrees, diagnostics,
            and safety-gated workspace operations.
          </p>
        </header>

        <section className="workspace-hero">
          <div className="workspace-hero-copy">
            <p className="workspace-eyebrow">Live worktree telemetry</p>
            <h2>Workspace Command Centre</h2>
            <p>Live repository, branch, worktree and diagnostics telemetry.</p>
          </div>

          <div
            className="agent-concept-panel"
            aria-labelledby="agent-concept-title"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="workspace-eyebrow">Future agent structure</p>
                <h2
                  id="agent-concept-title"
                  className="workspace-section-heading"
                >
                  Orchestrator / sub-agent pattern
                </h2>
              </div>
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" /> Concept only
              </Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              {AGENT_ROLES.map((agent) => (
                <div key={agent.name} className="agent-role-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {agent.name}
                    </span>
                    <span className="agent-role-chip">{agent.role}</span>
                  </div>
                  <p>{agent.brief}</p>
                </div>
              ))}
            </div>
            <div className="operating-rules mt-2">
              <div className="flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                <UsersRound className="h-3.5 w-3.5" /> Operating rules
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {OPERATING_RULES.map((rule) => (
                  <span key={rule} className="operating-rule-pill">
                    {rule}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="memory-burst" aria-hidden="true">
            <div className="burst-line line-one" />
            <div className="burst-line line-two" />
            <div className="burst-line line-three" />
            <div className="burst-orbit orbit-one" />
            <div className="burst-orbit orbit-two" />
            <div className="burst-core">
              <Boxes className="h-8 w-8" />
            </div>
            {Array.from({ length: 24 }, (_, index) => (
              <span
                key={index}
                className="burst-particle"
                style={{ "--i": index } as CSSProperties}
              />
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Metric title="Workspace count" value={String(workspaces.length)} />
          <Metric
            title="Main workspace"
            value={
              mainWorkspace
                ? `${mainWorkspace.branch ?? "unknown"} · ${mainWorkspace.path}`
                : "unknown"
            }
          />
          <Metric
            title="Selected repo"
            value={selectedRepository?.id ?? selectedRepoId ?? "loading"}
          />
        </div>

        <section className="workspace-panel overflow-hidden">
          <div className="workspace-panel-header flex items-center justify-between px-4 py-2.5">
            <h2 className="workspace-section-title">Repositories</h2>
            {(repositoriesQuery.isLoading || diagnosticsQuery.isFetching) && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="grid gap-3 p-3 lg:grid-cols-[minmax(220px,320px)_1fr]">
            <div>
              {repositoriesQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((item) => (
                    <Skeleton key={item} className="h-16 w-full" />
                  ))}
                </div>
              ) : repositories.length ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {repositories.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      onClick={() => setSelectedRepoId(repo.id)}
                      className={`repository-pill w-full p-2.5 text-left ${
                        selectedRepoId === repo.id
                          ? "repository-pill-active"
                          : ""
                      }`}
                    >
                      <div className="info-line flex items-center justify-between gap-3">
                        <span className="font-mono text-sm font-medium">
                          {repo.displayName}
                        </span>
                        {repo.productionProtected ? (
                          <Badge variant="destructive">Protected</Badge>
                        ) : (
                          <Badge variant="secondary">Allowed</Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {repo.rootPath}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 p-3 text-sm text-muted-foreground">
                  <p>No repositories returned.</p>
                  {repositoriesQuery.isError && (
                    <ApiErrorDetail error={repositoriesQuery.error} />
                  )}
                </div>
              )}
            </div>

            <div className="workspace-card-meta grid gap-2 p-3 text-sm sm:grid-cols-2">
              <InfoLine
                icon={Boxes}
                label="Repository"
                value={selectedRepository?.displayName ?? "loading"}
              />
              <InfoLine
                icon={GitBranch}
                label="Base"
                value={selectedRepository?.defaultBaseBranch ?? "unknown"}
              />
              <InfoLine
                icon={ShieldCheck}
                label="Protection"
                value={
                  selectedRepository?.productionProtected
                    ? "Protected"
                    : "Allowed"
                }
              />
              <InfoLine
                icon={Archive}
                label="Metadata"
                value={selectedRepository?.metadataPath ?? "unknown"}
              />
            </div>
          </div>
        </section>

        <section className="workspace-panel overflow-hidden">
          <div className="workspace-panel-header flex items-center justify-between px-4 py-2.5">
            <h2 className="workspace-section-title">Workspace cards</h2>
            {workspacesQuery.isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
            {workspacesQuery.isLoading ? (
              [1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-44 w-full" />
              ))
            ) : workspaces.length ? (
              workspaces.map((workspace) => (
                <WorkspaceCard
                  key={workspace.workspaceKey}
                  workspace={workspace}
                />
              ))
            ) : (
              <div className="col-span-full rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {workspacesQuery.isError ? (
                  <ApiErrorDetail error={workspacesQuery.error} />
                ) : (
                  "No workspaces returned for this repository."
                )}
              </div>
            )}
          </div>
        </section>

        <section className="workspace-panel diagnostics-panel overflow-hidden">
          <div className="workspace-panel-header px-4 py-2.5">
            <h2 className="workspace-section-title flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Diagnostics
            </h2>
          </div>
          <div className="diagnostics-compact p-3 text-sm">
            {diagnosticsQuery.isLoading ? (
              <div className="grid gap-2 md:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <Skeleton key={item} className="h-8 w-full" />
                ))}
              </div>
            ) : diagnosticsQuery.isError ? (
              <div className="space-y-2 text-destructive">
                <p>Unable to load diagnostics.</p>
                <ApiErrorDetail error={diagnosticsQuery.error} />
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <DiagnosticRow
                  label="Git"
                  value={diagnosticsQuery.data?.git.ok ? "OK" : "Error"}
                />
                <DiagnosticRow
                  label="Worktree CLI"
                  value={
                    diagnosticsQuery.data?.worktree.available
                      ? "Available"
                      : "Unavailable"
                  }
                />
                <DiagnosticRow
                  label="Creation"
                  value={creation?.enabled ? "Enabled" : "Disabled"}
                  muted={!creation?.enabled}
                />
                <DiagnosticRow
                  label="Cleanup"
                  value={cleanup?.enabled ? "Enabled" : "Disabled"}
                  muted={!cleanup?.enabled}
                />
                <DiagnosticRow
                  label="Metadata records"
                  value={String(
                    diagnosticsQuery.data?.metadata.records.length ?? 0,
                  )}
                />
              </div>
            )}
          </div>
        </section>

        <section className="workspace-panel overflow-hidden">
          <div className="workspace-panel-header px-4 py-2.5">
            <h2 className="workspace-section-title">Safety and metadata</h2>
          </div>
          <div className="grid gap-3 p-3 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="grid gap-2 md:grid-cols-2">
              <p className="diagnostic-note text-xs text-muted-foreground">
                Creation:{" "}
                {creation?.enabled
                  ? "Safety flag still required."
                  : creation?.reason}
              </p>
              <p className="diagnostic-note text-xs text-muted-foreground">
                Cleanup:{" "}
                {cleanup?.enabled
                  ? "Safety flag still required."
                  : cleanup?.reason}
              </p>
              <p className="diagnostic-note text-xs text-muted-foreground md:col-span-2">
                Repository root: {selectedRepository?.rootPath ?? "unknown"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DisabledActionButton label="Create Workspace" icon={Plus} />
              <DisabledActionButton label="Cleanup" icon={Trash2} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ApiErrorDetail({ error }: { error: unknown }) {
  return (
    <p className="api-error-detail font-mono text-xs">
      {formatWorkspacesError(error)}
    </p>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="workspace-stat p-4">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 truncate text-base font-light" title={value}>
        {value}
      </p>
    </div>
  );
}

function DiagnosticRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="diagnostic-row">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono text-xs ${muted ? "text-muted-foreground" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: OrcaWorkspace }) {
  const cleanStatus = statusLabel(workspace);

  return (
    <article className="workspace-card p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-mono text-sm font-semibold">
              {workspace.displayName ?? workspace.id}
            </h3>
            {workspace.isMainWorktree && (
              <Badge className="gap-1" variant="default">
                <BadgeCheck className="h-3 w-3" /> Main
              </Badge>
            )}
            {workspace.isArchived && (
              <Badge variant="secondary">Archived</Badge>
            )}
          </div>
          <p
            className="mt-1 truncate font-mono text-[0.68rem] text-muted-foreground"
            title={workspace.path}
          >
            {workspace.path}
          </p>
        </div>
        <span
          className={`workspace-status ${cleanStatus === "Dirty" ? "workspace-status-dirty" : cleanStatus === "Clean" ? "workspace-status-clean" : "workspace-status-unknown"}`}
        >
          {cleanStatus}
        </span>
      </div>

      <div className="workspace-card-meta space-y-1.5 p-2.5 text-xs">
        <InfoLine
          icon={GitBranch}
          label="Branch"
          value={workspace.branch ?? "unknown"}
        />
        <InfoLine
          icon={GitCommit}
          label="Head"
          value={shortCommit(workspace.head)}
        />
        <InfoLine icon={Boxes} label="Kind" value={workspace.workspaceKind} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DisabledActionButton label="Open in James" icon={Play} />
        <DisabledActionButton label="Launch Codex" icon={Hammer} />
        <DisabledActionButton label="Archive" icon={Archive} />
        <DisabledActionButton label="Cleanup" icon={Trash2} />
      </div>
      <p className="safety-gated-caption mt-3 text-xs">{SAFETY_GATED_REASON}</p>
    </article>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof GitBranch;
  label: string;
  value: string;
}) {
  return (
    <div className="info-line flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="truncate font-mono text-[0.68rem]" title={value}>
        {value}
      </span>
    </div>
  );
}
