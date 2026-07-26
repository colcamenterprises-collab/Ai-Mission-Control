import {
  useGetDashboardSummary,
  useListAgents,
  useListMemories,
  useListTasks,
} from "@workspace/api-client-react";
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
      <div className="mission-canvas mission-home-canvas">
        <header className="mission-page-hero workspace-panel" aria-label="Overview">
          <div>
            <p className="workspace-eyebrow">Mission Control</p>
            <h1 className="mission-page-title">Overview.</h1>
            <p className="mission-page-subtitle">Direct your AI team, keep work moving, and review what needs your attention.</p>
          </div>
          <div className="mission-home-actions">
            <Button asChild className="mission-primary-action">
              <Link href="/tasks">Add work</Link>
            </Button>
            <Button asChild variant="outline" className="mission-secondary-action">
              <Link href="/agent-creation">Employ AI worker</Link>
            </Button>
          </div>
        </header>

        <section className="mission-metric-grid">
          <MetricCard title="Work open" value={String(totalTasks)} loading={isSummaryLoading || isTasksLoading} tone="blue" />
          <MetricCard title="Working now" value={String(activeTasks)} loading={isSummaryLoading || isTasksLoading} tone="green" />
          <MetricCard title="AI team" value={String(installedAgents)} loading={isSummaryLoading} tone="violet" />
          <MetricCard title="Knowledge" value={String(memories.length)} loading={false} tone="amber" />
        </section>

        <section className="mission-dashboard-grid">
          <article className="mission-panel mission-panel-large">
            <PanelTitle title="Current work" action="View work" href="/tasks" />
            <div className="mission-work-summary">
              <WorkPill label="Working" value={activeTasks} />
              <WorkPill label="Waiting" value={waitingTasks} />
              <WorkPill label="Blocked" value={blockedTasks} />
            </div>
            <div className="mission-task-list">
              {latestTasks.length === 0 ? (
                <div className="mission-empty-state">
                  <span>No tasks logged</span>
                </div>
              ) : latestTasks.map((task) => (
                <Link href="/tasks" className="mission-task-row" key={task.id}>
                  <span className={`mission-status-dot mission-status-${task.status}`} />
                  <div>
                    <strong>{task.title}</strong>
                    <small>{task.assignee || "Unassigned"}</small>
                  </div>
                </Link>
              ))}
            </div>
          </article>

          <article className="mission-panel">
            <PanelTitle title="AI Team" action="Manage" href="/agent-creation" />
            <div className="mission-agent-strip" aria-label="AI team status">
              {Array.from({ length: Math.max(3, Math.min(6, installedAgents || 3)) }).map((_, index) => (
                <span key={index} className={index < activeAgents ? "is-active" : ""} />
              ))}
            </div>
            <div className="mission-panel-number">{installedAgents}</div>
          </article>

          <article className="mission-panel">
            <PanelTitle title="Reports" action="View reports" href="/reports" />
            <div className="mission-report-card">
              <strong>{completedTasks}</strong>
              <span>Ready</span>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ title, value, loading, tone }: { title: string; value: string; loading?: boolean; tone: "blue" | "green" | "violet" | "amber" }) {
  return (
    <article className={`mission-metric-card mission-metric-${tone}`}>
      <div>
        <span>{title}</span>
        {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <strong>{value}</strong>}
      </div>
    </article>
  );
}

function PanelTitle({ title, action, href }: { title: string; action: string; href: string }) {
  return (
    <div className="mission-panel-title">
      <div><span>{title}</span></div>
      <Button asChild size="sm" variant="ghost"><Link href={href}>{action}</Link></Button>
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
