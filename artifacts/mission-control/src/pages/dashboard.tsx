import type { CSSProperties } from "react";
import {
  useGetDashboardSummary,
  useListAgents,
  useListMemories,
  useListTasks,
} from "@workspace/api-client-react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  Brain,
  Calendar as CalendarIcon,
  CheckCircle2,
  GitBranch,
  ListTodo,
  MessageSquare,
  Radio,
  Users,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import "./workspaces.css";

const TASK_STAGES = ["backlog", "ready", "running", "blocked", "review", "done"] as const;

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: tasks = [], isLoading: isTasksLoading } = useListTasks();
  const { data: agents = [] } = useListAgents();
  const { data: memories = [] } = useListMemories();

  const totalTasks = tasks.length || (summary?.activeTaskCount ?? 0) + (summary?.pendingTaskCount ?? 0);
  const runningTasks = tasks.filter((task) => task.status === "running" || task.status === "in_progress").length;
  const reviewTasks = tasks.filter((task) => task.status === "review").length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const activeAgents = summary?.activeAgentCount ?? agents.filter((agent) => agent.status === "active").length;
  const installedAgents = agents.length || activeAgents || 1;

  const stageCounts = TASK_STAGES.map((stage) => ({
    stage,
    count: tasks.filter((task) => task.status === stage || (stage === "running" && task.status === "in_progress")).length,
  }));

  const latestTasks = [...tasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <section className="dashboard-command-grid">
          <div className="workspace-panel dashboard-command-card">
            <div className="dashboard-topline">
              <span className="status-dot status-dot-live" />
              Your business control room
            </div>
            <div>
              <h1 className="mission-page-title">Overview</h1>
              <p className="mission-page-subtitle">See what needs attention, who is working, and what to do next.</p>
            </div>
            <div className="dashboard-action-strip">
              <QuickLink href="/tasks" icon={ListTodo} label="Open Tasks" />
              <QuickLink href="/team" icon={Users} label="Employ AI Team" />
              <QuickLink href="/memory" icon={Brain} label="Add Knowledge" />
              <QuickLink href="/skills" icon={Zap} label="Open Playbooks" />
            </div>
          </div>

          <div className="workspace-panel dashboard-orbit-card" aria-label="Mission Control status visual">
            <div className="orbit-visual">
              <span className="orbit-ring orbit-ring-one" />
              <span className="orbit-ring orbit-ring-two" />
              <span className="orbit-core-dot" />
            </div>
            <div className="orbit-stats">
              <VisualStat label="tasks" value={String(totalTasks)} loading={isSummaryLoading || isTasksLoading} />
              <VisualStat label="AI team" value={String(installedAgents)} />
              <VisualStat label="knowledge" value={String(memories.length)} />
            </div>
          </div>
        </section>

        <section className="dashboard-kpi-grid">
          <MetricTile title="Working" value={String(summary?.activeTaskCount ?? runningTasks)} icon={Activity} loading={isSummaryLoading} tone="cyan" />
          <MetricTile title="Review" value={String(reviewTasks)} icon={CheckCircle2} loading={isTasksLoading} tone="violet" />
          <MetricTile title="Blocked" value={String(blockedTasks)} icon={Radio} loading={isTasksLoading} tone="amber" />
          <MetricTile title="Upcoming" value={String(summary?.upcomingEventCount ?? 0)} icon={CalendarIcon} loading={isSummaryLoading} tone="green" />
        </section>

        <section className="dashboard-visual-grid">
          <div className="workspace-panel visual-panel visual-panel-large">
            <PanelHeader icon={GitBranch} title="Task Flow" action="Open" href="/tasks" />
            <div className="stage-map">
              {stageCounts.map((item) => (
                <div className="stage-row" key={item.stage}>
                  <span>{plainStage(item.stage)}</span>
                  <div className="stage-track"><span style={{ width: `${Math.min(100, item.count * 24)}%` }} /></div>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="workspace-panel visual-panel">
            <PanelHeader icon={Brain} title="Knowledge" action="View" href="/memory" />
            <div className="memory-node-map" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => (
                <span key={index} style={{ "--i": index } as CSSProperties} />
              ))}
            </div>
            <div className="visual-count-row"><span>stored</span><strong>{memories.length}</strong></div>
          </div>

          <div className="workspace-panel visual-panel">
            <PanelHeader icon={Users} title="AI Team" action="Employ" href="/team" />
            <div className="agent-cluster">
              {Array.from({ length: Math.max(1, Math.min(6, installedAgents)) }).map((_, index) => (
                <span key={index} className={index < activeAgents ? "agent-node agent-node-live" : "agent-node"} />
              ))}
            </div>
            <div className="visual-count-row"><span>team members</span><strong>{installedAgents}</strong></div>
          </div>

          <div className="workspace-panel visual-panel visual-panel-large">
            <PanelHeader icon={MessageSquare} title="Current Work" action="Tasks" href="/tasks" />
            <div className="compact-task-list">
              {latestTasks.length === 0 ? (
                <div className="empty-visual-state">No active work yet</div>
              ) : latestTasks.map((task) => (
                <Link href="/tasks" className="compact-task" key={task.id}>
                  <span className={`status-dot status-dot-${task.status}`} />
                  <span>{task.title}</span>
                  <strong>{task.assignee}</strong>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function plainStage(stage: string) {
  const names: Record<string, string> = {
    backlog: "Ideas",
    ready: "Ready",
    running: "Working",
    blocked: "Blocked",
    review: "Review",
    done: "Done",
  };

  return names[stage] ?? stage.replace("_", " ");
}

function VisualStat({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div>
      {loading ? <Skeleton className="h-7 w-12" /> : <strong>{value}</strong>}
      <span>{label}</span>
    </div>
  );
}

function MetricTile({ title, value, icon: Icon, loading, tone }: { title: string; value: string; icon: LucideIcon; loading?: boolean; tone: "cyan" | "violet" | "amber" | "green" }) {
  return (
    <div className={`workspace-stat metric-tile metric-tile-${tone}`}>
      <Icon className="h-4 w-4" />
      <span>{title}</span>
      {loading ? <Skeleton className="h-8 w-14" /> : <strong>{value}</strong>}
    </div>
  );
}

function PanelHeader({ icon: Icon, title, action, href }: { icon: LucideIcon; title: string; action: string; href: string }) {
  return (
    <div className="visual-panel-header">
      <div><Icon className="h-4 w-4" /><span>{title}</span></div>
      <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"><Link href={href}>{action}<ArrowRight className="h-3 w-3" /></Link></Button>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return <Button asChild size="sm" className="quick-launch-button gap-2"><Link href={href}><Icon className="h-3.5 w-3.5" />{label}</Link></Button>;
}
