import {
  useGetDashboardSummary,
  useListAgents,
  useListMemories,
  useListTasks,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentAvatar } from "@/components/agent-avatar";
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
  const installedAgents = agents.length || (summary?.activeAgentCount ?? 0);
  const latestTasks = [...tasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div className="mission-shell h-full overflow-y-auto">
      <div className="mission-canvas mission-home-canvas">
        <header className="mission-page-hero workspace-panel" aria-label="Overview">
          <h1 className="mission-page-title">Overview</h1>
          <div className="mission-home-actions">
            <Button asChild className="mission-primary-action">
              <Link href="/tasks">New task</Link>
            </Button>
            <Button asChild variant="outline" className="mission-secondary-action">
              <Link href="/agent-creation">Add agent</Link>
            </Button>
          </div>
        </header>

        <section className="mission-metric-grid">
          <MetricCard title="Work open" value={String(totalTasks)} loading={isSummaryLoading || isTasksLoading} tone="blue" />
          <MetricCard title="Working now" value={String(activeTasks)} loading={isSummaryLoading || isTasksLoading} tone="green" />
          <MetricCard title="AI team" value={String(installedAgents)} loading={isSummaryLoading} tone="violet" />
          <MetricCard title="Knowledge" value={String(memories.length)} loading={false} tone="amber" />
        </section>

        <section className="mission-agent-strip" aria-label="AI team">
          <div className="mission-section-heading">
            <h2>AI team</h2>
            <Button asChild size="sm" variant="outline"><Link href="/agent-creation">Add agent</Link></Button>
          </div>
          <div className="mission-agent-row">
            {agents.map((agent) => (
              <Link href="/team" className="mission-agent-card" key={agent.id}>
                <AgentAvatar name={agent.name} initials={agent.avatarInitials} />
                <span><strong>{agent.name}</strong><small>{agent.role}</small></span>
              </Link>
            ))}
            {agents.length === 0 && <span className="mission-agent-empty">No agents added</span>}
          </div>
        </section>

        <article className="mission-panel mission-current-work">
          <PanelTitle title="Current work" action="View tasks" href="/tasks" />
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
