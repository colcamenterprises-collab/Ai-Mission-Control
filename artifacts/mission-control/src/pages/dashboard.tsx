import {
  useGetDashboardSummary,
  useListAgents,
  useListMemories,
  useListTasks,
} from "@workspace/api-client-react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileText,
  ListTodo,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import "./workspaces.css";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: tasks = [], isLoading: isTasksLoading } = useListTasks();
  const { data: agents = [] } = useListAgents();
  const { data: memories = [] } = useListMemories();

  const totalTasks = tasks.length || (summary?.activeTaskCount ?? 0) + (summary?.pendingTaskCount ?? 0);
  const activeTasks = summary?.activeTaskCount ?? tasks.filter((task) => task.status === "running" || task.status === "in_progress").length;
  const waitingTasks = summary?.pendingTaskCount ?? tasks.filter((task) => ["backlog", "ready", "review"].includes(task.status)).length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const activeAgents = summary?.activeAgentCount ?? agents.filter((agent) => agent.status === "active").length;
  const installedAgents = agents.length || activeAgents;
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const latestTasks = [...tasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div className="mission-shell h-full overflow-y-auto">
      <div className="mission-canvas">
        <header className="mission-topbar">
          <div>
            <p className="mission-kicker">Mission Control</p>
            <h1>Run the work. Manage the AI team.</h1>
          </div>
          <div className="mission-topbar-actions">
            <Button asChild className="mission-primary-action">
              <Link href="/tasks"><Plus className="h-4 w-4" /> Add work</Link>
            </Button>
            <Button asChild variant="outline" className="mission-secondary-action">
              <Link href="/team"><Bot className="h-4 w-4" /> Employ AI worker</Link>
            </Button>
          </div>
        </header>

        <section className="mission-metric-grid">
          <MetricCard title="Work open" value={String(totalTasks)} detail="tasks logged" icon={ListTodo} loading={isSummaryLoading || isTasksLoading} tone="blue" />
          <MetricCard title="In progress" value={String(activeTasks)} detail="being worked on" icon={Clock3} loading={isSummaryLoading || isTasksLoading} tone="green" />
          <MetricCard title="AI workers" value={String(installedAgents)} detail={activeAgents > 0 ? `${activeAgents} active` : "ready to employ"} icon={Bot} loading={isSummaryLoading} tone="violet" />
          <MetricCard title="Knowledge" value={String(memories.length)} detail="files and notes" icon={FileText} loading={false} tone="amber" />
        </section>

        <section className="mission-dashboard-grid">
          <article className="mission-panel mission-panel-large">
            <PanelTitle icon={BriefcaseBusiness} title="Work board" action="View tasks" href="/tasks" />
            <div className="mission-work-summary">
              <WorkPill label="Working" value={activeTasks} />
              <WorkPill label="Waiting" value={waitingTasks} />
              <WorkPill label="Blocked" value={blockedTasks} />
            </div>
            <div className="mission-task-list">
              {latestTasks.length === 0 ? (
                <div className="mission-empty-state">
                  <Sparkles className="h-5 w-5" />
                  <span>No work logged yet</span>
                  <small>Add the first task and assign it to a person or AI worker.</small>
                </div>
              ) : latestTasks.map((task) => (
                <Link href="/tasks" className="mission-task-row" key={task.id}>
                  <span className={`mission-status-dot mission-status-${task.status}`} />
                  <div>
                    <strong>{task.title}</strong>
                    <small>{task.assignee || "Unassigned"}</small>
                  </div>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </article>

          <article className="mission-panel">
            <PanelTitle icon={Users} title="AI team" action="Employ" href="/team" />
            <div className="mission-agent-strip" aria-label="AI team status">
              {Array.from({ length: Math.max(3, Math.min(6, installedAgents || 3)) }).map((_, index) => (
                <span key={index} className={index < activeAgents ? "is-active" : ""} />
              ))}
            </div>
            <div className="mission-panel-number">{installedAgents}</div>
            <p className="mission-panel-copy">Create specialist workers, connect providers, and assign work from one place.</p>
          </article>

          <article className="mission-panel">
            <PanelTitle icon={CheckCircle2} title="Reports" action="Open" href="/reports" />
            <div className="mission-report-card">
              <span>Work complete</span>
              <strong>{completedTasks} reports ready</strong>
            </div>
            <p className="mission-panel-copy">Review what changed, what was done, and anything that needs owner attention.</p>
          </article>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ title, value, detail, icon: Icon, loading, tone }: { title: string; value: string; detail: string; icon: LucideIcon; loading?: boolean; tone: "blue" | "green" | "violet" | "amber" }) {
  return (
    <article className={`mission-metric-card mission-metric-${tone}`}>
      <div>
        <span>{title}</span>
        {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <strong>{value}</strong>}
        <small>{detail}</small>
      </div>
      <Icon className="h-5 w-5" />
    </article>
  );
}

function PanelTitle({ icon: Icon, title, action, href }: { icon: LucideIcon; title: string; action: string; href: string }) {
  return (
    <div className="mission-panel-title">
      <div><Icon className="h-4 w-4" /><span>{title}</span></div>
      <Button asChild size="sm" variant="ghost"><Link href={href}>{action}<ArrowRight className="h-3.5 w-3.5" /></Link></Button>
    </div>
  );
}

function WorkPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="mission-work-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
