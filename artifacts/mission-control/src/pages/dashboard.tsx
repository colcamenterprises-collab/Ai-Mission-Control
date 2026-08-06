import { useEffect, useMemo, useState } from "react";
import {
  useGetDashboardSummary,
  useListAgents,
  useListMemories,
  useListTasks,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { JamesAvatar } from "@/components/james-avatar";
import "./workspaces.css";
import "./dashboard-operations.css";

type OperationalTask = {
  id: string | number;
  title: string;
  description?: string | null;
  assignee?: string | null;
  status: string;
  updatedAt: string;
  createdAt?: string;
  dueDate?: string | null;
  recurrence?: string | null;
  approvalRequired?: boolean | null;
};

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: rawTasks = [], isLoading: isTasksLoading } = useListTasks();
  const { data: agents = [] } = useListAgents();
  const { data: memories = [] } = useListMemories();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const tasks = rawTasks as unknown as OperationalTask[];
  const totalTasks = tasks.length || (summary?.activeTaskCount ?? 0) + (summary?.pendingTaskCount ?? 0);
  const activeTasks = summary?.activeTaskCount ?? tasks.filter((task) => task.status === "running" || task.status === "in_progress").length;
  const waitingTasks = summary?.pendingTaskCount ?? tasks.filter((task) => ["backlog", "ready", "review"].includes(task.status)).length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const installedAgents = agents.length || (summary?.activeAgentCount ?? 0);

  const latestTasks = useMemo(() => [...tasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5), [tasks]);

  const approvals = useMemo(() => tasks
    .filter((task) => task.approvalRequired && !["done", "completed", "archived"].includes(task.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4), [tasks]);

  const automations = useMemo(() => tasks
    .filter((task) => Boolean(task.dueDate) || Boolean(task.recurrence && task.recurrence !== "one_off"))
    .sort((a, b) => {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 4), [tasks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="mission-shell h-full overflow-y-auto">
      <div className="mission-canvas mission-home-canvas mission-operations-home">
        <section className="mission-metric-grid">
          <MetricCard title="Work open" value={String(totalTasks)} loading={isSummaryLoading || isTasksLoading} tone="blue" />
          <MetricCard title="Working now" value={String(activeTasks)} loading={isSummaryLoading || isTasksLoading} tone="green" />
          <MetricCard title="AI team" value={String(installedAgents)} loading={isSummaryLoading} tone="violet" />
          <MetricCard title="Knowledge" value={String(memories.length)} loading={false} tone="amber" />
        </section>

        <div className="mission-ops-grid mission-ops-grid-primary">
          <article className="mission-panel mission-current-work">
            <PanelTitle title="Current work" action="View tasks" href="/tasks" />
            <div className="mission-work-summary">
              <WorkPill label="Working" value={activeTasks} />
              <WorkPill label="Waiting" value={waitingTasks} />
              <WorkPill label="Blocked" value={blockedTasks} />
            </div>
            <div className="mission-task-list">
              {latestTasks.length === 0 ? (
                <CompactEmpty>No tasks logged</CompactEmpty>
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

          <article className="mission-panel mission-briefing-panel">
            <PanelTitle title="James briefing" action="Knowledge" href="/memory" />
            <div className="mission-briefing-head">
              <JamesAvatar className="mission-briefing-avatar" />
              <div>
                <strong>Chief of Staff</strong>
                <small>Live operational summary</small>
              </div>
            </div>
            <div className="mission-briefing-copy">
              <p>{activeTasks > 0 ? `${activeTasks} task${activeTasks === 1 ? " is" : "s are"} being worked now.` : "No tasks are actively running right now."}</p>
              <p>{approvals.length > 0 ? `${approvals.length} item${approvals.length === 1 ? " needs" : "s need"} your approval before work can continue.` : "Nothing is waiting for owner approval."}</p>
              <p>{blockedTasks > 0 ? `${blockedTasks} task${blockedTasks === 1 ? " is" : "s are"} blocked and should be reviewed.` : `${waitingTasks} task${waitingTasks === 1 ? " is" : "s are"} queued or waiting.`}</p>
              <p>{automations.length > 0 ? `${automations.length} scheduled or recurring item${automations.length === 1 ? " is" : "s are"} visible in the upcoming queue.` : "No upcoming automation is currently visible from task scheduling."}</p>
            </div>
            <Link href="/tasks" className="mission-briefing-action">Open workboard</Link>
          </article>
        </div>

        <div className="mission-ops-grid mission-ops-grid-secondary">
          <OpsPanel title="Approval inbox" action="Open tasks" href="/tasks" badge={approvals.length}>
            {approvals.length === 0 ? <CompactEmpty>Nothing needs approval</CompactEmpty> : approvals.map((task) => (
              <OpsRow key={task.id} title={task.title} meta={`${task.assignee || "AI team"} · ${prettyStatus(task.status)}`} href="/tasks" accent="approval" />
            ))}
          </OpsPanel>

          <OpsPanel title="Live activity" action="Run history" href="/reports">
            {latestTasks.length === 0 ? <CompactEmpty>No activity yet</CompactEmpty> : latestTasks.slice(0, 4).map((task) => (
              <OpsRow key={task.id} title={task.title} meta={`${prettyStatus(task.status)} · ${timeAgo(task.updatedAt)}`} href="/tasks" accent="activity" />
            ))}
          </OpsPanel>

          <OpsPanel title="Automations" action="Open calendar" href="/tasks" badge={automations.length}>
            {automations.length === 0 ? <CompactEmpty>No scheduled work</CompactEmpty> : automations.map((task) => (
              <OpsRow
                key={task.id}
                title={task.title}
                meta={task.dueDate ? formatSchedule(task.dueDate, task.recurrence) : `Recurring · ${task.recurrence}`}
                href="/tasks"
                accent="automation"
              />
            ))}
          </OpsPanel>
        </div>

        <button className="mission-command-trigger" type="button" onClick={() => setPaletteOpen(true)}>
          <span>Quick actions</span><kbd>⌘K</kbd>
        </button>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
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
      <Link href={href} className="mission-text-action">{action}</Link>
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

function OpsPanel({ title, action, href, badge, children }: { title: string; action: string; href: string; badge?: number; children: React.ReactNode }) {
  return (
    <article className="mission-panel mission-ops-panel">
      <div className="mission-panel-title mission-ops-title">
        <div><span>{title}</span>{typeof badge === "number" && badge > 0 && <b>{badge}</b>}</div>
        <Link href={href} className="mission-text-action">{action}</Link>
      </div>
      <div className="mission-ops-list">{children}</div>
    </article>
  );
}

function OpsRow({ title, meta, href, accent }: { title: string; meta: string; href: string; accent: "approval" | "activity" | "automation" }) {
  return (
    <Link href={href} className={`mission-ops-row mission-ops-${accent}`}>
      <span className="mission-ops-indicator" />
      <div><strong>{title}</strong><small>{meta}</small></div>
    </Link>
  );
}

function CompactEmpty({ children }: { children: React.ReactNode }) {
  return <div className="mission-ops-empty"><span>{children}</span></div>;
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const actions = [
    { label: "Create or manage tasks", detail: "Workboard and automation calendar", href: "/tasks" },
    { label: "Open AI team", detail: "Agents and roles", href: "/team" },
    { label: "Search knowledge", detail: "Notes, processes and decisions", href: "/memory" },
    { label: "View reports", detail: "Execution and operational reporting", href: "/reports" },
  ];
  return (
    <div className="mission-command-backdrop" onMouseDown={onClose}>
      <div className="mission-command-palette" role="dialog" aria-modal="true" aria-label="Quick actions" onMouseDown={(event) => event.stopPropagation()}>
        <header><span>Mission Control</span><kbd>ESC</kbd></header>
        <div>
          {actions.map((action) => (
            <Link href={action.href} key={action.href} onClick={onClose}>
              <span><strong>{action.label}</strong><small>{action.detail}</small></span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function prettyStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function timeAgo(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Recently";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatSchedule(value: string, recurrence?: string | null) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return recurrence && recurrence !== "one_off" ? recurrence : "Scheduled";
  const formatted = date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return recurrence && recurrence !== "one_off" ? `${formatted} · ${recurrence}` : formatted;
}
