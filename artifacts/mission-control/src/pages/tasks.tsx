import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTasks,
  useMoveTask,
  getListTasksQueryKey,
  type Task,
} from "@workspace/api-client-react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2, CircleAlert, Clock, MessageSquare, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { OrchestratorIntakePanel } from "@/components/orchestrator-intake-panel";
import "./workspaces.css";

type MissionTask = Task & { status: Task["status"] };

const COLUMNS: Array<{ id: Task["status"]; label: string; icon: LucideIcon }> = [
  { id: "backlog", label: "Backlog", icon: Clock },
  { id: "ready", label: "Ready", icon: Sparkles },
  { id: "running", label: "Running", icon: Play },
  { id: "blocked", label: "Blocked", icon: CircleAlert },
  { id: "review", label: "Review", icon: MessageSquare },
  { id: "done", label: "Done", icon: CheckCircle2 },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/20 text-blue-300",
  high: "bg-yellow-500/20 text-yellow-300",
  critical: "bg-destructive/20 text-destructive",
  urgent: "bg-destructive/20 text-destructive",
};

function displayPriority(priority: string) {
  return priority === "urgent" ? "Critical" : priority.charAt(0).toUpperCase() + priority.slice(1);
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState({ priority: "all", project: "all" });
  const { data: tasks = [], isLoading } = useListTasks();
  const moveTask = useMoveTask();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const projects = Array.from(new Set(tasks.map((task) => task.project))).filter(Boolean);
  const filteredTasks = tasks.filter((task) => {
    if (filter.priority !== "all" && task.priority !== filter.priority) return false;
    if (filter.project !== "all" && task.project !== filter.project) return false;
    return true;
  });

  const moveTo = (task: MissionTask, status: Task["status"]) => {
    moveTask.mutate({ id: task.id, data: { status } }, { onSuccess: invalidate });
  };

  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <section className="tasks-hero workspace-panel">
          <div>
            <span className="dashboard-topline"><MessageSquare className="h-3.5 w-3.5" /> Tasks + Chat</span>
            <h1 className="mission-page-title">Command Queue</h1>
          </div>
          <div className="tasks-filter-row">
            <Select value={filter.priority} onValueChange={(priority) => setFilter((current) => ({ ...current, priority }))}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter.project} onValueChange={(project) => setFilter((current) => ({ ...current, project }))}>
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((project) => <SelectItem key={project} value={project}>{project}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </section>

        <OrchestratorIntakePanel />

        <section className="task-board-grid">
          {isLoading ? (
            COLUMNS.map((column) => (
              <div className="task-lane workspace-panel" key={column.id}>
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))
          ) : COLUMNS.map((column) => {
            const Icon = column.icon;
            const laneTasks = filteredTasks.filter((task) => task.status === column.id || (column.id === "running" && task.status === "in_progress"));
            return (
              <div className="task-lane workspace-panel" key={column.id}>
                <div className="task-lane-head">
                  <div><Icon className="h-3.5 w-3.5" /><span>{column.label}</span></div>
                  <strong>{laneTasks.length}</strong>
                </div>
                <div className="task-lane-list">
                  {laneTasks.length === 0 ? (
                    <div className="empty-visual-state">Clear</div>
                  ) : laneTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onMove={moveTo} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function TaskCard({ task, onMove }: { task: MissionTask; onMove: (task: MissionTask, status: Task["status"]) => void }) {
  const nextStatus: Task["status"] | null = task.status === "backlog" ? "ready" : task.status === "ready" ? "running" : task.status === "running" || task.status === "in_progress" ? "review" : task.status === "review" ? "done" : null;

  return (
    <article className="task-card-minimal">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3>{task.title}</h3>
          <span>{task.project}</span>
        </div>
        <Badge className={`text-[10px] ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium}`}>{displayPriority(task.priority)}</Badge>
      </div>
      <div className="task-card-foot">
        <span>{task.assignee}</span>
        {nextStatus && (
          <button type="button" onClick={() => onMove(task, nextStatus)}>
            Move <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </article>
  );
}
