import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListTasks, useMoveTask, getListTasksQueryKey, type Task } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ListTodo, MoreHorizontal, ArrowRight } from "lucide-react";
import { OrchestratorIntakePanel } from "@/components/orchestrator-intake-panel";
import "./workspaces.css";
import "./tasks-simple.css";

type MissionTask = Task & { status: Task["status"] };

const COLUMNS: Array<{ id: Task["status"]; label: string; matches: Task["status"][] }> = [
  { id: "backlog", label: "To do", matches: ["backlog", "ready"] },
  { id: "running", label: "Working", matches: ["running", "in_progress"] },
  { id: "review", label: "Owner review", matches: ["review", "blocked"] },
  { id: "done", label: "Done", matches: ["done"] },
];

export default function Tasks() {
  const queryClient = useQueryClient();
  const [filter] = useState({ priority: "all", project: "all" });
  const { data: tasks = [], isLoading } = useListTasks();
  const moveTask = useMoveTask();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

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
      <div className="workspaces-canvas tasks-canvas-simple space-y-4">
        <header className="work-hero">
          <div><p>Mission Control</p><h1>Work.</h1><span>Everything moving across your business, in one clear view.</span></div>
          <div className="work-hero-summary"><ListTodo /><strong>{tasks.length}</strong><span>open items</span></div>
        </header>
        <OrchestratorIntakePanel />

        <section className="task-board-grid">
          {isLoading ? (
            COLUMNS.map((column) => <div className="task-lane workspace-panel" key={column.id}><Skeleton className="h-5 w-20" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>)
          ) : COLUMNS.map((column) => {
            const laneTasks = filteredTasks.filter((task) => column.matches.includes(task.status));
            return (
              <div className="task-lane workspace-panel" key={column.id}>
                <div className="task-lane-head">
                  <div><span>{column.label}</span><small>{laneTasks.length} {laneTasks.length === 1 ? "item" : "items"}</small></div>
                  <MoreHorizontal />
                </div>
                <div className="task-lane-list">
                  {laneTasks.length === 0 ? <div className="empty-visual-state">Clear</div> : laneTasks.map((task) => <TaskCard key={task.id} task={task} onMove={moveTo} />)}
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
      <div className="task-card-main">
        <h3>{task.title}</h3>
        <span>{task.assignee || "Awaiting allocation"}</span>
      </div>
      <div className="task-card-footer"><em className={`task-priority task-priority-${task.priority}`}>{task.priority}</em>{nextStatus && <button type="button" onClick={() => onMove(task, nextStatus)} aria-label="Move work forward"><ArrowRight /></button>}</div>
    </article>
  );
}
