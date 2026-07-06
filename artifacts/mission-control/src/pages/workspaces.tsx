import { useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  FolderGit2,
  GitBranch,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  TriangleAlert,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import "./workspaces.css";

type RepositoryConfig = {
  id: string;
  displayName: string;
  rootPath: string;
  defaultBaseBranch: string;
  worktreeRoot: string;
  productionProtected: boolean;
  metadataPath: string;
};

type Workspace = {
  id: string;
  repo: string;
  path: string;
  head: string | null;
  branch: string | null;
  isMainWorktree: boolean;
  workspaceStatus: string | null;
  displayName: string | null;
  isArchived: boolean;
};

type Diagnostics = {
  repository: RepositoryConfig;
  git: { ok: boolean; dirty: boolean; branch: string | null; head: string | null; error: string | null; statusLines: string[] };
  worktree: { ok: boolean; available: boolean; worktreeCount: number; error: string | null };
  metadata: { records: unknown[] };
  creation: { enabled: boolean; requiresSafetyFlag: boolean; reason: string };
  cleanup: { enabled: boolean; requiresSafetyFlag: boolean; reason: string };
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function shortSha(value: string | null) {
  return value ? value.slice(0, 7) : "UNKNOWN";
}

function statusTone(ok: boolean) {
  return ok ? "text-emerald-300" : "text-amber-300";
}

export default function Workspaces() {
  const repositories = useQuery({
    queryKey: ["worktrees", "repositories"],
    queryFn: () => getJson<{ repositories: RepositoryConfig[] }>("/api/worktrees/repositories"),
  });
  const workspaces = useQuery({
    queryKey: ["worktrees", "workspaces"],
    queryFn: () => getJson<{ workspaces: Workspace[] }>("/api/worktrees/workspaces"),
  });
  const diagnostics = useQuery({
    queryKey: ["worktrees", "diagnostics"],
    queryFn: () => getJson<Diagnostics>("/api/worktrees/diagnostics"),
  });

  const workspaceList = workspaces.data?.workspaces ?? [];
  const repoList = repositories.data?.repositories ?? [];
  const dirtyCount = diagnostics.data?.git.dirty ? 1 : 0;
  const lastUpdated = useMemo(() => new Date().toLocaleTimeString(), [repositories.dataUpdatedAt, workspaces.dataUpdatedAt, diagnostics.dataUpdatedAt]);

  const stats = [
    { label: "Repositories", value: repoList.length, detail: "configured", icon: FolderGit2, accent: "cyan" },
    { label: "Workspaces", value: workspaceList.length, detail: `${workspaceList.filter((item) => item.isMainWorktree).length} main`, icon: Boxes, accent: "violet" },
    { label: "Agents Active", value: 0, detail: "placeholder", icon: Cpu, accent: "emerald" },
    { label: "Memory Used", value: `${diagnostics.data?.metadata.records.length ?? 0}`, detail: "metadata records", icon: BrainCircuit, accent: "blue" },
  ];

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-hidden">
      <header className="border-b border-cyan-400/10 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.32em] text-cyan-300/70">
              <Sparkles className="h-3.5 w-3.5" /> Mission Control Workspace Grid
            </div>
            <h1 className="font-mono text-2xl font-semibold uppercase tracking-tight text-white">Workspaces</h1>
            <p className="mt-1 text-sm text-slate-400">Isolated environments for AI agents to build, test and ship.</p>
          </div>
          <Badge className="w-fit border-emerald-400/30 bg-emerald-400/10 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-200">
            Read-only live backend
          </Badge>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className={`workspace-stat workspace-stat-${stat.accent}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400">{stat.label}</span>
                <stat.icon className="h-4 w-4" />
              </div>
              <div className="mt-4 flex items-end justify-between">
                <strong className="font-mono text-3xl text-white">{repositories.isLoading || workspaces.isLoading ? "--" : stat.value}</strong>
                <span className="text-xs uppercase text-slate-500">{stat.detail}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="workspace-panel relative min-h-[360px] overflow-hidden p-5">
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-violet-300">Live Memory Expansion</p>
                <h2 className="mt-2 font-mono text-2xl font-semibold uppercase text-white">Mission Control Memory</h2>
              </div>
              <Badge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">CSS/SVG Burst</Badge>
            </div>
            <MemoryBurst />
          </div>

          <DiagnosticsPanel diagnostics={diagnostics.data} loading={diagnostics.isLoading} error={diagnostics.error} />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="workspace-panel p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm uppercase tracking-[0.24em] text-white">Workspace Cards</h2>
              <Badge className="border-slate-500/30 bg-slate-500/10 text-slate-300">{workspaceList.length} live</Badge>
            </div>
            {workspaces.isLoading ? (
              <div className="grid gap-3 md:grid-cols-2">{[1, 2].map((item) => <Skeleton key={item} className="h-48 rounded-xl bg-slate-800/70" />)}</div>
            ) : workspaceList.length ? (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {workspaceList.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} dirty={workspace.isMainWorktree && dirtyCount > 0} />)}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">No workspaces returned by the live backend.</div>
            )}
          </div>
          <ActionsPanel />
        </section>
      </div>

      <footer className="grid gap-px border-t border-cyan-400/10 bg-cyan-400/10 sm:grid-cols-5">
        <Metric label="System Load" value={diagnostics.data?.git.ok ? "Nominal" : "Degraded"} />
        <Metric label="Active Tasks" value="0 placeholder" />
        <Metric label="Queue" value="0 placeholder" />
        <Metric label="Uptime" value="API live" />
        <Metric label="Last Updated" value={lastUpdated} />
      </footer>
    </div>
  );
}

function MemoryBurst() {
  return <div className="memory-burst" aria-hidden="true"><div className="burst-orbit orbit-one" /><div className="burst-orbit orbit-two" /><div className="burst-core"><BrainCircuit className="h-12 w-12" /></div>{Array.from({ length: 24 }).map((_, index) => <span key={index} className="burst-particle" style={{ "--i": index } as CSSProperties} />)}</div>;
}

function DiagnosticsPanel({ diagnostics, loading, error }: { diagnostics?: Diagnostics; loading: boolean; error: Error | null }) {
  const rows = [
    ["Workspace Health", diagnostics?.git.ok && diagnostics?.worktree.ok, diagnostics?.git.ok ? "Operational" : diagnostics?.git.error],
    ["Git Repository", diagnostics?.git.ok, diagnostics?.repository.displayName],
    ["Worktree Support", diagnostics?.worktree.available, `${diagnostics?.worktree.worktreeCount ?? 0} detected`],
    ["File System", !!diagnostics?.repository.rootPath, diagnostics?.repository.rootPath],
    ["Permissions", diagnostics?.creation.requiresSafetyFlag && diagnostics?.cleanup.requiresSafetyFlag, "Safety gated"],
    ["Orca Metadata", !!diagnostics?.metadata, `${diagnostics?.metadata.records.length ?? 0} records`],
  ];
  return <aside className="workspace-panel p-4"><h2 className="mb-4 font-mono text-sm uppercase tracking-[0.24em] text-white">Workspace Health</h2>{loading ? <div className="space-y-3"><Skeleton className="h-12 bg-slate-800" /><Skeleton className="h-12 bg-slate-800" /></div> : error ? <div className="text-sm text-amber-300">Diagnostics unavailable: {error.message}</div> : <div className="space-y-2">{rows.map(([label, ok, detail]) => <div key={String(label)} className="diagnostic-row"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</p><p className="mt-1 truncate text-xs text-slate-300">{String(detail ?? "UNKNOWN")}</p></div>{ok ? <CheckCircle2 className={`h-4 w-4 ${statusTone(true)}`} /> : <XCircle className="h-4 w-4 text-amber-300" />}</div>)}</div>}</aside>;
}

function WorkspaceCard({ workspace, dirty }: { workspace: Workspace; dirty: boolean }) {
  return <article className="workspace-card"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-mono text-sm font-semibold text-white">{workspace.displayName || workspace.repo}</h3><p className="mt-1 truncate text-xs text-slate-500">{workspace.path}</p></div>{workspace.isMainWorktree && <Badge className="border-violet-300/40 bg-violet-400/10 text-violet-100">MAIN</Badge>}</div><div className="mt-4 grid gap-2 text-xs"><Info icon={GitBranch} label="Branch" value={workspace.branch ?? "UNKNOWN"} /><Info icon={TerminalSquare} label="Commit" value={shortSha(workspace.head)} /><Info icon={ShieldCheck} label="Status" value={dirty ? "DIRTY" : "CLEAN"} tone={dirty ? "text-amber-300" : "text-emerald-300"} /><Info icon={Zap} label="Agent" value="Unassigned placeholder" /></div></article>;
}

function Info({ icon: Icon, label, value, tone = "text-slate-200" }: { icon: typeof GitBranch; label: string; value: string; tone?: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2"><span className="flex items-center gap-2 text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</span><span className={`min-w-0 truncate font-mono ${tone}`}>{value}</span></div>;
}

function ActionsPanel() {
  const actions = [[Rocket, "Create Workspace"], [Play, "Launch Codex"], [Sparkles, "Launch James"], [Trash2, "Cleanup Workspace"], [Archive, "Archive Workspace"]] as const;
  return <aside className="workspace-panel p-4"><h2 className="mb-4 font-mono text-sm uppercase tracking-[0.24em] text-white">Actions</h2><div className="space-y-2">{actions.map(([Icon, label]) => <Button key={label} disabled variant="outline" className="h-auto w-full justify-start border-slate-700/80 bg-slate-950/50 py-3 text-left"><Icon className="mr-3 h-4 w-4" /><span><span className="block text-xs text-slate-200">{label}</span><span className="block text-[10px] text-slate-500">Coming next / safety gated</span></span></Button>)}</div><div className="mt-4 flex gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100"><TriangleAlert className="h-4 w-4 flex-shrink-0" />Real worktree operations remain disabled.</div></aside>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-slate-950/90 px-4 py-3"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p><p className="mt-1 truncate font-mono text-xs text-cyan-100">{value}</p></div>;
}
