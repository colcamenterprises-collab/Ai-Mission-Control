import { useMemo, useState, type CSSProperties } from "react";
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
  Trash2,
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

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with HTTP ${response.status}`);
  }

  return (await response.json()) as T;
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
  const [selectedRepoId, setSelectedRepoId] = useState("mission-control");

  const repositoriesQuery = useQuery({
    queryKey: ["worktrees", "repositories"],
    queryFn: () =>
      fetchJson<WorktreeRepositoriesResponse>("/api/worktrees/repositories"),
  });

  const workspacesQuery = useQuery({
    queryKey: ["worktrees", "workspaces", selectedRepoId],
    queryFn: () =>
      fetchJson<WorktreeWorkspacesResponse>(
        `/api/worktrees/workspaces?repoId=${encodeURIComponent(selectedRepoId)}`,
      ),
  });

  const diagnosticsQuery = useQuery({
    queryKey: ["worktrees", "diagnostics", selectedRepoId],
    queryFn: () =>
      fetchJson<WorktreeDiagnosticsResponse>(
        `/api/worktrees/diagnostics?repoId=${encodeURIComponent(selectedRepoId)}`,
      ),
  });

  const repositories = repositoriesQuery.data?.repositories ?? [];
  const workspaces = workspacesQuery.data?.workspaces ?? [];
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
      <div className="workspaces-canvas">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              <h1 className="font-mono text-2xl font-semibold uppercase tracking-tight">
                Workspaces
              </h1>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Orca-inspired workspace manager for read-only repository and
              worktree visibility. Creation, agent launch, archive, and cleanup
              actions remain safety gated.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DisabledActionButton label="Create Workspace" icon={Plus} />
            <DisabledActionButton label="Cleanup" icon={Trash2} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(280px,340px)_1fr]">
          <aside className="space-y-5">
            <section className="workspace-panel overflow-hidden">
              <div className="workspace-panel-header px-4 py-3">
                <h2 className="font-mono text-sm uppercase text-muted-foreground">
                  Repositories
                </h2>
              </div>
              <div className="p-3">
                {repositoriesQuery.isLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((item) => (
                      <Skeleton key={item} className="h-20 w-full" />
                    ))}
                  </div>
                ) : repositories.length ? (
                  <div className="space-y-2">
                    {repositories.map((repo) => (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => setSelectedRepoId(repo.id)}
                        className={`repository-pill w-full p-3 text-left ${
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
                        <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                          {repo.rootPath}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          Base: {repo.defaultBaseBranch}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    No repositories returned.
                  </p>
                )}
              </div>
            </section>

            <section className="workspace-panel diagnostics-panel overflow-hidden">
              <div className="workspace-panel-header px-4 py-3">
                <h2 className="flex items-center gap-2 font-mono text-sm uppercase text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" /> Diagnostics
                </h2>
              </div>
              <div className="diagnostics-compact p-4 text-sm">
                {diagnosticsQuery.isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((item) => (
                      <Skeleton key={item} className="h-8 w-full" />
                    ))}
                  </div>
                ) : diagnosticsQuery.isError ? (
                  <p className="text-destructive">
                    Unable to load diagnostics.
                  </p>
                ) : (
                  <>
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
                    <p className="diagnostic-note text-xs text-muted-foreground">
                      {creation?.enabled
                        ? "Safety flag still required."
                        : creation?.reason}
                    </p>
                    <DiagnosticRow
                      label="Cleanup"
                      value={cleanup?.enabled ? "Enabled" : "Disabled"}
                      muted={!cleanup?.enabled}
                    />
                    <p className="diagnostic-note text-xs text-muted-foreground">
                      {cleanup?.enabled
                        ? "Safety flag still required."
                        : cleanup?.reason}
                    </p>
                    <DiagnosticRow
                      label="Metadata records"
                      value={String(
                        diagnosticsQuery.data?.metadata.records.length ?? 0,
                      )}
                    />
                  </>
                )}
              </div>
            </section>
          </aside>

          <section className="space-y-5">
            <section className="workspace-hero">
              <div className="workspace-hero-copy">
                <p className="workspace-eyebrow">
                  Live worktree command centre
                </p>
                <h2>
                  Premium workspace visibility without operational side effects.
                </h2>
                <p>
                  Read-only repository, branch, commit, and diagnostics
                  telemetry stay connected to the live worktree APIs while
                  mutation workflows remain safety gated.
                </p>
              </div>
              <div className="memory-burst" aria-hidden="true">
                <div className="burst-line line-one" />
                <div className="burst-line line-two" />
                <div className="burst-line line-three" />
                <div className="burst-orbit orbit-one" />
                <div className="burst-orbit orbit-two" />
                <div className="burst-core">
                  <Boxes className="h-10 w-10" />
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Metric
                title="Workspace count"
                value={String(workspaces.length)}
              />
              <Metric
                title="Main workspace"
                value={mainWorkspace?.branch ?? "unknown"}
              />
              <Metric
                title="Selected repo"
                value={selectedRepository?.id ?? selectedRepoId}
              />
            </div>

            <div className="workspace-panel overflow-hidden">
              <div className="workspace-panel-header flex items-center justify-between px-4 py-3">
                <h2 className="font-mono text-sm uppercase text-muted-foreground">
                  Workspace Cards
                </h2>
                {(workspacesQuery.isLoading || diagnosticsQuery.isFetching) && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
                {workspacesQuery.isLoading ? (
                  [1, 2, 3, 4].map((item) => (
                    <Skeleton key={item} className="h-56 w-full" />
                  ))
                ) : workspaces.length ? (
                  workspaces.map((workspace) => (
                    <WorkspaceCard
                      key={workspace.workspaceKey}
                      workspace={workspace}
                    />
                  ))
                ) : (
                  <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No workspaces returned for this repository.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="workspace-stat p-4">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 truncate text-xl font-light">{value}</p>
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
    <article className="workspace-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
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
          <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
            {workspace.path}
          </p>
        </div>
        <span
          className={`workspace-status ${cleanStatus === "Dirty" ? "workspace-status-dirty" : cleanStatus === "Clean" ? "workspace-status-clean" : "workspace-status-unknown"}`}
        >
          {cleanStatus}
        </span>
      </div>

      <div className="workspace-card-meta space-y-2 p-3 text-sm">
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

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
      <span className="truncate font-mono text-xs">{value}</span>
    </div>
  );
}
