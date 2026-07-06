import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useGetDashboardSummary, useListActivity } from "@workspace/api-client-react";
import {
  Activity,
  Boxes,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
  ListTodo,
  ShieldCheck,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { jamesIdentity } from "@/lib/agent-identities";
import "./workspaces.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() ?? "").replace(/\/$/, "");
const ADMIN_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_ADMIN_TOKEN_STORAGE_KEY = "MISSION_CONTROL_ADMIN_TOKEN";
const MVP_FALLBACK_ADMIN_TOKEN = "change-this-later";

type WorktreeRepository = {
  id: string;
  displayName: string;
  rootPath: string;
  defaultBaseBranch: string;
  productionProtected: boolean;
};

type OrcaWorkspace = {
  workspaceKey: string;
  repo: string;
  path: string;
  branch: string | null;
  isMainWorktree: boolean;
  workspaceStatus: string | null;
};

type WorktreeRepositoriesResponse = { repositories: WorktreeRepository[] };
type WorktreeWorkspacesResponse = { workspaces: OrcaWorkspace[] };

function authHeaders(): HeadersInit {
  const storedToken =
    localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ||
    localStorage.getItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY)?.trim();
  const envToken = import.meta.env.VITE_MISSION_CONTROL_ADMIN_TOKEN?.trim();
  return { Authorization: `Bearer ${storedToken || envToken || MVP_FALLBACK_ADMIN_TOKEN}` };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json", ...authHeaders() },
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}`);
  return (await response.json()) as T;
}

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: isActivityLoading } = useListActivity({ limit: 8 });
  const repositoriesQuery = useQuery({
    queryKey: ["home", "worktrees", "repositories"],
    queryFn: () => fetchJson<WorktreeRepositoriesResponse>("/api/worktrees/repositories"),
  });
  const workspacesQuery = useQuery({
    queryKey: ["home", "worktrees", "workspaces"],
    queryFn: () => fetchJson<WorktreeWorkspacesResponse>("/api/worktrees/workspaces"),
  });

  const repositories = repositoriesQuery.data?.repositories ?? [];
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const mainWorkspace = workspaces.find((workspace) => workspace.isMainWorktree);
  const activeRepositoryCount = repositories.length;

  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-5">
        <section className="workspace-hero mission-home-hero">
          <div className="workspace-hero-copy max-w-3xl">
            <p className="workspace-eyebrow">Mission Control Home Screen</p>
            <h1>Workspace Command Centre</h1>
            <p>
              One operational surface for system status, repositories, orchestration, agent activity, jobs, workspace context, and permissions.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="sm" className="gap-2"><Link href="/tasks"><ListTodo className="h-3.5 w-3.5" />Launch Tasks</Link></Button>
              <Button asChild size="sm" variant="outline" className="gap-2"><Link href="/workspaces"><Boxes className="h-3.5 w-3.5" />Repositories</Link></Button>
              <Button asChild size="sm" variant="outline" className="gap-2"><Link href="/orchestrator"><Terminal className="h-3.5 w-3.5" />Orchestrator</Link></Button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <HomeMetric title="Live system status" value="Operational" icon={CheckCircle2} tone="good" />
          <HomeMetric title="Active repositories" value={String(activeRepositoryCount)} icon={Boxes} loading={repositoriesQuery.isLoading} />
          <HomeMetric title="Current orchestrator" value={jamesIdentity.name} icon={Users} />
          <HomeMetric title="Agent activity" value={String(summary?.activeAgentCount ?? 0)} icon={Activity} loading={isSummaryLoading} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <section className="workspace-panel overflow-hidden">
            <div className="workspace-panel-header flex items-center justify-between px-4 py-3">
              <h2 className="workspace-section-title flex items-center gap-2"><Activity className="h-4 w-4" /> Recent jobs and activity</h2>
              <span className="workspace-status workspace-status-clean">live</span>
            </div>
            {isActivityLoading ? (
              <div className="space-y-3 p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : activity?.length ? (
              <div className="divide-y divide-border/50">
                {activity.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-4 p-4 transition-colors hover:bg-white/5">
                    <div className={`mt-1.5 h-2 w-2 rounded-full ${entry.status === "active" ? "bg-primary shadow-[0_0_8px_rgba(0,212,255,0.8)]" : entry.status === "pending" ? "bg-yellow-500" : entry.status === "error" ? "bg-destructive" : "bg-muted-foreground"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-medium">{entry.agentName}</p>
                        <time className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">{new Date(entry.createdAt).toLocaleTimeString()}</time>
                      </div>
                      <p className="mt-1 text-sm text-foreground/80">{entry.action}</p>
                      {entry.detail && <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{entry.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">No recent activity</div>
            )}
          </section>

          <div className="space-y-4">
            <section className="workspace-panel p-4">
              <h2 className="workspace-section-title mb-3 flex items-center gap-2"><GitBranch className="h-4 w-4" /> Current workspace</h2>
              <InfoRow label="Repository" value={mainWorkspace?.repo ?? "unknown"} />
              <InfoRow label="Branch" value={mainWorkspace?.branch ?? "unknown"} />
              <InfoRow label="Path" value={mainWorkspace?.path ?? "unknown"} />
            </section>
            <section className="workspace-panel p-4">
              <h2 className="workspace-section-title mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Current permissions</h2>
              <InfoRow label="Mode" value="Read-only dashboard" />
              <InfoRow label="Workspace actions" value="Safety gated" />
              <InfoRow label="Production" value="Protected" />
            </section>
            <section className="workspace-panel p-4">
              <h2 className="workspace-section-title mb-3 flex items-center gap-2"><Zap className="h-4 w-4" /> Quick launch</h2>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <QuickLink href="/content" icon={FileText} label="Content" />
                <QuickLink href="/calendar" icon={CalendarIcon} label="Calendar" />
                <QuickLink href="/team" icon={Users} label="Team" />
                <QuickLink href="/settings" icon={ShieldCheck} label="Settings" />
              </div>
            </section>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <HomeMetric title="Active tasks" value={String(summary?.activeTaskCount ?? 0)} icon={ListTodo} loading={isSummaryLoading} />
          <HomeMetric title="Pending tasks" value={String(summary?.pendingTaskCount ?? 0)} icon={Clock} loading={isSummaryLoading} tone="warning" />
          <HomeMetric title="Upcoming events" value={String(summary?.upcomingEventCount ?? 0)} icon={CalendarIcon} loading={isSummaryLoading} />
        </div>
      </div>
    </div>
  );
}

function HomeMetric({ title, value, icon: Icon, loading, tone }: { title: string; value: string; icon: typeof Activity; loading?: boolean; tone?: "good" | "warning" }) {
  return (
    <div className="workspace-stat p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
        <Icon className={`h-4 w-4 ${tone === "good" ? "text-emerald-300" : tone === "warning" ? "text-yellow-400" : "text-primary"}`} />
      </div>
      {loading ? <Skeleton className="h-8 w-20" /> : <p className="truncate text-3xl font-light tracking-tight">{value}</p>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="diagnostic-row mb-2 text-xs"><span className="font-mono uppercase tracking-wider text-muted-foreground">{label}</span><span className="truncate text-right" title={value}>{value}</span></div>;
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof Activity; label: string }) {
  return <Button asChild variant="outline" size="sm" className="justify-start gap-2"><Link href={href}><Icon className="h-3.5 w-3.5" />{label}</Link></Button>;
}
