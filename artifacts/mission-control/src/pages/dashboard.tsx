import { useGetDashboardSummary } from "@workspace/api-client-react";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  FileText,
  ListTodo,
  Radio,
  ShieldCheck,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import "./workspaces.css";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();

  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-5">
        <section className="workspace-hero mission-home-hero">
          <div className="workspace-hero-copy max-w-3xl">
            <div className="mission-title-lockup">
              <h1>Mission Control Dashboard</h1>
            </div>
            <p>
              Summary home for the AI agent team, task flow, memory, repositories, content calendar, contacts, and operating status.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="sm" className="quick-launch-button gap-2"><Link href="/tasks"><ListTodo className="h-3.5 w-3.5" />Launch Tasks</Link></Button>
              <Button asChild size="sm" className="quick-launch-button gap-2"><Link href="/workspaces"><Terminal className="h-3.5 w-3.5" />Repositories</Link></Button>
              <Button asChild size="sm" className="quick-launch-button gap-2"><Link href="/team"><Users className="h-3.5 w-3.5" />Agent Team</Link></Button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <HomeMetric title="Agents Online" value="1" detail="James online by default" icon={Users} tone="good" />
          <HomeMetric title="Current Orchestrator" value="James" detail="Role assignment: Orchestrator" icon={Radio} tone="good" />
          <HomeMetric title="Active Tasks" value={String(summary?.activeTaskCount ?? 0)} icon={ListTodo} loading={isSummaryLoading} />
          <HomeMetric title="Pending Tasks" value={String(summary?.pendingTaskCount ?? 0)} icon={Clock} loading={isSummaryLoading} tone="warning" />
          <HomeMetric title="Upcoming Events" value={String(summary?.upcomingEventCount ?? 0)} icon={CalendarIcon} loading={isSummaryLoading} />
          <HomeMetric title="Daily Token Usage" value="0" detail="All agents; token backend not connected" icon={Zap} />
        </div>


        <section className="workspace-panel p-4">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300/80">Visual Intelligence</p>
              <h2 className="dashboard-section-title mt-1">Knowledge Graph</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Permanent local graph panel for Mission Control. Future Graphify runs will replace this placeholder with repository, wiki, docs and diagram intelligence.
              </p>
            </div>
            <div className="rounded-lg border border-cyan-400/30 px-3 py-2 text-right font-mono text-xs uppercase text-cyan-100">
              <div>Status: Local Artifact</div>
              <div>No External Dependency</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-cyan-400/20 bg-black/30">
            <iframe
              title="Mission Control Knowledge Graph"
              src="/knowledge-graph/mission-control/graph.html"
              className="h-[360px] w-full border-0"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs font-mono uppercase">
            <a className="text-cyan-300 hover:text-cyan-100" href="/knowledge-graph/mission-control/graph.html" target="_blank" rel="noreferrer">Open Graph</a>
            <a className="text-cyan-300 hover:text-cyan-100" href="/knowledge-graph/mission-control/GRAPH_REPORT.md" target="_blank" rel="noreferrer">Open Report</a>
            <a className="text-cyan-300 hover:text-cyan-100" href="/knowledge-graph/mission-control/graph.json" target="_blank" rel="noreferrer">Open JSON</a>
          </div>
        </section>


        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="workspace-panel p-4">
            <h2 className="dashboard-section-title mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Recent activity</h2>
            <InfoRow label="Task intake" value="User-created tasks route to Orchestrator review" />
            <InfoRow label="Delegation" value="Orchestrator assigns by agent role/capability" />
            <InfoRow label="Approvals" value="Reports and handoffs remain attached to tasks" />
          </section>
          <section className="workspace-panel p-4">
            <h2 className="dashboard-section-title mb-3 flex items-center gap-2"><Zap className="h-4 w-4" /> Quick Launch</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <QuickLink href="/content" icon={FileText} label="Content" />
              <QuickLink href="/calendar" icon={CalendarIcon} label="Calendar" />
              <QuickLink href="/team" icon={Users} label="Team" />
              <QuickLink href="/settings" icon={ShieldCheck} label="Settings" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function HomeMetric({ title, value, icon: Icon, loading, detail, tone }: { title: string; value: string; icon: typeof CheckCircle2; loading?: boolean; detail?: string; tone?: "good" | "warning" }) {
  return (
    <div className="workspace-stat p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
        <Icon className={`h-4 w-4 ${tone === "good" ? "text-emerald-300" : tone === "warning" ? "text-yellow-400" : "text-primary"}`} />
      </div>
      {loading ? <Skeleton className="h-8 w-20" /> : <p className="truncate text-3xl font-light tracking-tight">{value}</p>}
      {detail ? <p className="mt-2 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="diagnostic-row mb-2 text-xs"><span className="font-mono uppercase tracking-wider text-muted-foreground">{label}</span><span className="truncate text-right" title={value}>{value}</span></div>;
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof CheckCircle2; label: string }) {
  return <Button asChild size="sm" className="quick-launch-button justify-start gap-2"><Link href={href}><Icon className="h-3.5 w-3.5" />{label}</Link></Button>;
}
