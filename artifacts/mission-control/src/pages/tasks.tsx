import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListTasks, useMoveTask, useListEvents, getListTasksQueryKey, type Task } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { OrchestratorIntakePanel } from "@/components/orchestrator-intake-panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AgentAvatar, agentTone } from "@/components/agent-avatar";
import "./workspaces.css";
import "./tasks-simple.css";

type MissionTask = Task & { status: Task["status"] };

const COLUMNS: Array<{ id: Task["status"]; label: string; matches: Task["status"][] }> = [
  { id: "backlog", label: "New", matches: ["backlog"] },
  { id: "ready", label: "Ready", matches: ["ready"] },
  { id: "running", label: "In progress", matches: ["running", "in_progress"] },
  { id: "review", label: "Your approval", matches: ["review", "blocked"] },
  { id: "done", label: "Completed", matches: ["done"] },
];

export default function Tasks() {
  const queryClient = useQueryClient();
  const [filter] = useState({ priority: "all", project: "all" });
  const [selectedTask, setSelectedTask] = useState<MissionTask | null>(null);
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
          <div><h1>Tasks</h1></div>
          <div className="work-hero-summary"><strong>{tasks.length}</strong><span>open</span></div>
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
                </div>
                <div className="task-lane-list">
                  {laneTasks.length === 0 ? <div className="empty-visual-state">Clear</div> : laneTasks.map((task) => <TaskCard key={task.id} task={task} onOpen={() => setSelectedTask(task)} onMove={moveTo} />)}
                </div>
              </div>
            );
          })}
        </section>
        <MonthlyPlanner tasks={tasks} onOpenTask={(task) => setSelectedTask(task as MissionTask)} />
      </div>
      <TaskDialog task={selectedTask} onClose={() => setSelectedTask(null)} onMove={(task, status) => { moveTo(task, status); setSelectedTask({ ...task, status }); }} />
    </div>
  );
}

function TaskCard({ task, onOpen, onMove }: { task: MissionTask; onOpen: () => void; onMove: (task: MissionTask, status: Task["status"]) => void }) {
  const nextStatus: Task["status"] | null = task.status === "backlog" ? "ready" : task.status === "ready" ? "running" : task.status === "running" || task.status === "in_progress" ? "review" : task.status === "review" ? "done" : null;

  return (
    <article className={`task-card-minimal task-agent-${agentTone(task.assignee)}`} onClick={onOpen}>
      <div className="task-card-main">
        <h3>{task.title}</h3>
        <span className="task-agent-owner"><AgentAvatar name={task.assignee} />{task.assignee || "Awaiting allocation"}</span>
      </div>
      <div className="task-card-footer"><em className={`task-priority task-priority-${task.priority}`}>{task.priority}</em>{nextStatus && <button type="button" onClick={(event) => { event.stopPropagation(); onMove(task, nextStatus); }}>Next</button>}</div>
    </article>
  );
}

function TaskDialog({ task, onClose, onMove }: { task: MissionTask | null; onClose: () => void; onMove: (task: MissionTask, status: Task["status"]) => void }) {
  if (!task) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader><DialogTitle>{task.title}</DialogTitle></DialogHeader>
        <div className="task-detail-grid">
          <div><span>Status</span><strong>{COLUMNS.find((column) => column.matches.includes(task.status))?.label ?? task.status}</strong></div>
          <div><span>Agent</span><strong>{task.assignee || "Being assigned"}</strong></div>
          <div><span>Due</span><strong>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "Not set"}</strong></div>
          <div><span>Project</span><strong>{task.project}</strong></div>
        </div>
        {task.description && <p className="task-detail-description">{task.description}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {task.status === "review" || task.status === "blocked" ? (
            <>
              <Button variant="outline" onClick={() => onMove(task, "running")}>Changes</Button>
              <Button onClick={() => onMove(task, "done")}>Approve</Button>
            </>
          ) : task.status !== "done" ? (
            <Button onClick={() => onMove(task, task.status === "backlog" ? "ready" : task.status === "ready" ? "running" : "review")}>Move forward</Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MonthlyPlanner({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (task: Task) => void }) {
  const [month, setMonth] = useState(() => new Date());
  const { data: events = [] } = useListEvents();
  const days = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const first = new Date(year, monthIndex, 1);
    const start = new Date(year, monthIndex, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const datedTasks = tasks.filter((task) => task.dueDate);
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  return (
    <section className="workspace-panel task-monthly-planner">
      <header>
        <div><strong>{month.toLocaleDateString("en", { month: "long", year: "numeric" })}</strong></div>
        <div>
          <button onClick={() => setMonth(new Date())}>Today</button>
          <button onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}>Previous</button>
          <button onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}>Next</button>
        </div>
      </header>
      <div className="task-calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <b key={day}>{day}</b>)}
        {days.map((date) => {
          const dateKey = key(date);
          const dayTasks = datedTasks.filter((task) => task.dueDate?.slice(0, 10) === dateKey);
          const dayEvents = events.filter((event) => event.startDate.slice(0, 10) === dateKey);
          const isCurrent = date.getMonth() === month.getMonth();
          return (
            <div key={dateKey} className={isCurrent ? "" : "outside"}>
              <span>{date.getDate()}</span>
              {dayTasks.slice(0, 2).map((task) => <button key={task.id} onClick={() => onOpenTask(task)}>{task.title}</button>)}
              {dayEvents.slice(0, Math.max(0, 2 - dayTasks.length)).map((event) => <em key={event.id}>{event.title}</em>)}
              {dayTasks.length + dayEvents.length > 2 && <small>+{dayTasks.length + dayEvents.length - 2}</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
