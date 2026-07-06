import { useGetDashboardSummary } from "@workspace/api-client-react";
import {
  Activity,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  FileText,
  ListTodo,
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
              <CustomliLogo />
              <h1>Workspace Command Centre</h1>
            </div>
            <p>
              One operational surface for system status, orchestration, active jobs, workspace context, and permissions.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="sm" className="quick-launch-button gap-2"><Link href="/tasks"><ListTodo className="h-3.5 w-3.5" />Launch Tasks</Link></Button>
              <Button asChild size="sm" className="quick-launch-button gap-2"><Link href="/workspaces"><Terminal className="h-3.5 w-3.5" />Repositories</Link></Button>
              <Button asChild size="sm" className="quick-launch-button gap-2"><Link href="/orchestrator"><Terminal className="h-3.5 w-3.5" />Orchestrator</Link></Button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <HomeMetric title="Live system status" value="Operational" icon={CheckCircle2} tone="good" />
          <HomeMetric title="Active tasks" value={String(summary?.activeTaskCount ?? 0)} icon={ListTodo} loading={isSummaryLoading} />
          <HomeMetric title="Pending tasks" value={String(summary?.pendingTaskCount ?? 0)} icon={Clock} loading={isSummaryLoading} tone="warning" />
          <HomeMetric title="Upcoming events" value={String(summary?.upcomingEventCount ?? 0)} icon={CalendarIcon} loading={isSummaryLoading} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <section className="workspace-panel p-4">
            <h2 className="workspace-section-title mb-3 flex items-center gap-2"><Activity className="h-4 w-4" /> Daily token usage</h2>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Total tokens used today across all agents</p>
            <p className="mt-3 text-sm text-foreground/80">No token usage recorded today</p>
          </section>

          <div className="space-y-4">
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
      </div>
    </div>
  );
}

function CustomliLogo() {
  return (
    <svg className="customli-logo" viewBox="0 0 228 198" aria-label="Customli logo" role="img">
      <path d="M84 31 31 84c-31 31-31 81 0 112s81 31 112 0l22-22" fill="none" stroke="currentColor" strokeWidth="23" strokeLinecap="round" />
      <path d="M144 167 197 114c31-31 31-81 0-112s-81-31-112 0L63 24" fill="none" stroke="currentColor" strokeWidth="23" strokeLinecap="round" />
      <path d="M57 58 171 172M171 26 57 140" fill="none" stroke="currentColor" strokeWidth="23" strokeLinecap="round" />
    </svg>
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
  return <Button asChild size="sm" className="quick-launch-button justify-start gap-2"><Link href={href}><Icon className="h-3.5 w-3.5" />{label}</Link></Button>;
}
