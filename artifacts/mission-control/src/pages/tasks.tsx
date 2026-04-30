import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useListTasks, useCreateTask, useUpdateTask, useDeleteTask, useMoveTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Task } from "@workspace/api-client-react";
import { Plus, ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const COLUMNS: { id: Task["status"]; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "in_progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/20 text-blue-400",
  high: "bg-yellow-500/20 text-yellow-400",
  urgent: "bg-destructive/20 text-destructive",
};

const COLUMN_INDEX: Record<string, number> = {
  backlog: 0,
  in_progress: 1,
  review: 2,
  done: 3,
};

const PROJECTS = ["Strategy", "Content", "Infrastructure", "Education", "Marketing"];

/* ─── Droppable column wrapper ──────────────────────────────── */
function DroppableColumn({
  col,
  children,
  count,
  isOver,
}: {
  col: { id: string; label: string };
  children: React.ReactNode;
  count: number;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      className={`w-72 flex-shrink-0 flex flex-col rounded-lg border transition-colors duration-150 ${
        isOver
          ? "border-primary/60 bg-primary/5"
          : "border-border bg-card/50"
      }`}
    >
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="font-mono text-xs uppercase text-muted-foreground">{col.label}</span>
        <span className={`font-mono text-xs px-2 py-0.5 rounded transition-colors ${isOver ? "bg-primary/20 text-primary" : "bg-secondary"}`}>
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[120px]">
        {children}
        {/* Drop zone hint */}
        {isOver && (
          <div className="h-1 rounded-full bg-primary/40 mx-1 animate-pulse" />
        )}
      </div>
    </div>
  );
}

/* ─── Draggable card ────────────────────────────────────────── */
function DraggableCard({
  task,
  onOpen,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
  isDragging,
}: {
  task: Task;
  onOpen: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={task}
        onOpen={onOpen}
        onMoveLeft={onMoveLeft}
        onMoveRight={onMoveRight}
        canMoveLeft={canMoveLeft}
        canMoveRight={canMoveRight}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

/* ─── Pure task card (used in overlay too) ──────────────────── */
function TaskCard({
  task,
  onOpen,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
  dragHandleProps,
  isOverlay,
}: {
  task: Task;
  onOpen?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  dragHandleProps?: Record<string, unknown>;
  isOverlay?: boolean;
}) {
  return (
    <div
      className={`bg-card border rounded p-3 transition-all group ${
        isOverlay
          ? "border-primary/60 shadow-xl shadow-primary/10 rotate-1 scale-105 cursor-grabbing"
          : "border-border hover:border-primary/50 cursor-pointer"
      }`}
      onClick={!isOverlay ? onOpen : undefined}
    >
      <div className="flex items-start gap-1.5 mb-2">
        {/* Drag handle */}
        <div
          {...dragHandleProps}
          className={`mt-0.5 flex-shrink-0 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors cursor-grab active:cursor-grabbing ${isOverlay ? "text-muted-foreground/50" : "opacity-0 group-hover:opacity-100"}`}
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <p className="text-sm font-medium leading-snug flex-1">{task.title}</p>
        <Badge className={`text-xs px-1.5 py-0 flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`}>
          {task.priority}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span className="font-mono">{task.assignee}</span>
        <span className="bg-secondary px-1.5 py-0.5 rounded">{task.project}</span>
      </div>

      {task.dueDate && (
        <div className="text-xs text-muted-foreground font-mono mb-2">
          Due: {new Date(task.dueDate).toLocaleDateString()}
        </div>
      )}

      {/* Manual move arrows */}
      {!isOverlay && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button
            disabled={!canMoveLeft}
            onClick={onMoveLeft}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-mono transition-colors ${
              canMoveLeft
                ? "hover:bg-secondary text-muted-foreground hover:text-foreground"
                : "text-muted-foreground/20 cursor-not-allowed"
            }`}
            title="Move left"
          >
            <ChevronLeft className="w-3 h-3" />
            Move
          </button>
          <div className="flex-1" />
          <button
            disabled={!canMoveRight}
            onClick={onMoveRight}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-mono transition-colors ${
              canMoveRight
                ? "hover:bg-secondary text-muted-foreground hover:text-foreground"
                : "text-muted-foreground/20 cursor-not-allowed"
            }`}
            title="Move right"
          >
            Move
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Main board ────────────────────────────────────────────── */
export default function Tasks() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState({ priority: "all", assignee: "all", project: "all" });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  const { data: tasks, isLoading } = useListTasks();
  const moveTask = useMoveTask();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const filteredTasks = (tasks ?? []).filter(t => {
    if (filter.priority !== "all" && t.priority !== filter.priority) return false;
    if (filter.project !== "all" && t.project !== filter.project) return false;
    return true;
  });

  const tasksByColumn = (col: string) => filteredTasks.filter(t => t.status === col);

  const moveTo = (task: Task, status: Task["status"]) => {
    moveTask.mutate({ id: task.id, data: { status } }, { onSuccess: invalidate });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = (tasks ?? []).find(t => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setOverColumnId(null);
    if (!over) return;

    const targetColId = COLUMNS.find(c => c.id === over.id)?.id;
    if (!targetColId) return;

    const task = (tasks ?? []).find(t => t.id === active.id);
    if (!task || task.status === targetColId) return;

    moveTo(task, targetColId);
  };

  const handleDragOver = (event: { over: { id: string | number } | null }) => {
    const colId = event.over ? COLUMNS.find(c => c.id === event.over!.id)?.id ?? null : null;
    setOverColumnId(colId ?? null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-mono font-semibold uppercase tracking-tight">Tasks Board</h1>
        <div className="flex items-center gap-3">
          <Select value={filter.priority} onValueChange={v => setFilter(f => ({ ...f, priority: v }))}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filter.project} onValueChange={v => setFilter(f => ({ ...f, project: v }))}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {PROJECTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" onClick={() => setShowCreate(true)}>
            <Plus className="w-3 h-3 mr-1" /> New Task
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        {isLoading ? (
          <div className="flex gap-4">
            {COLUMNS.map(col => (
              <div key={col.id} className="w-72 flex-shrink-0 space-y-3">
                <Skeleton className="h-6 w-24" />
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
              </div>
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver as any}
          >
            <div className="flex gap-4 h-full">
              {COLUMNS.map(col => {
                const colTasks = tasksByColumn(col.id);
                const colIdx = COLUMN_INDEX[col.id];
                return (
                  <DroppableColumn
                    key={col.id}
                    col={col}
                    count={colTasks.length}
                    isOver={overColumnId === col.id}
                  >
                    {colTasks.map(task => (
                      <DraggableCard
                        key={task.id}
                        task={task}
                        isDragging={activeTask?.id === task.id}
                        onOpen={() => setSelectedTask(task)}
                        canMoveLeft={colIdx > 0}
                        canMoveRight={colIdx < COLUMNS.length - 1}
                        onMoveLeft={() => moveTo(task, COLUMNS[colIdx - 1].id)}
                        onMoveRight={() => moveTo(task, COLUMNS[colIdx + 1].id)}
                      />
                    ))}
                  </DroppableColumn>
                );
              })}
            </div>

            <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
              {activeTask ? (
                <TaskCard task={activeTask} isOverlay />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Task Detail Dialog */}
      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onDelete={() => deleteTask.mutate({ id: selectedTask.id }, { onSuccess: () => { invalidate(); setSelectedTask(null); } })}
          onMove={(status) => {
            moveTo(selectedTask, status);
            setSelectedTask(t => t ? { ...t, status } : null);
          }}
          onUpdate={(data) => {
            updateTask.mutate({ id: selectedTask.id, data }, { onSuccess: () => { invalidate(); setSelectedTask(null); } });
          }}
        />
      )}

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(data) => {
          createTask.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } });
        }}
      />
    </div>
  );
}

/* ─── Task detail dialog ────────────────────────────────────── */
function TaskDetailDialog({
  task,
  onClose,
  onDelete,
  onMove,
  onUpdate,
}: {
  task: Task;
  onClose: () => void;
  onDelete: () => void;
  onMove: (status: Task["status"]) => void;
  onUpdate: (data: Partial<Task>) => void;
}) {
  const curIdx = COLUMN_INDEX[task.status] ?? 0;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm pr-6">{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Quick move strip */}
          <div className="flex items-center gap-2 p-2 bg-secondary/40 rounded-lg">
            <span className="text-xs font-mono text-muted-foreground mr-1">Move to:</span>
            {COLUMNS.map((col, i) => (
              <button
                key={col.id}
                onClick={() => onMove(col.id)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                  col.id === task.status
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {col.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Assignee</label>
              <p className="mt-1">{task.assignee}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Priority</label>
              <p className="mt-1">
                <Badge className={`text-xs ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</Badge>
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Project</label>
              <p className="mt-1">{task.project}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Status</label>
              <p className="mt-1 capitalize">{task.status.replace("_", " ")}</p>
            </div>
          </div>

          {task.description && (
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Description</label>
              <p className="mt-1 text-muted-foreground">{task.description}</p>
            </div>
          )}

          {task.dueDate && (
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase">Due Date</label>
              <p className="mt-1 font-mono text-xs">{new Date(task.dueDate).toLocaleDateString()}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-border">
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              className="text-xs"
            >
              Delete
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={onClose} className="text-xs">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Create task dialog ────────────────────────────────────── */
function CreateTaskDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: any) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    assignee: "Me",
    priority: "medium",
    status: "backlog",
    project: "Strategy",
    dueDate: "",
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono">New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Input
            placeholder="Task title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <Textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground font-mono uppercase">Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "urgent"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground font-mono uppercase">Start in</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLUMNS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground font-mono uppercase">Project</Label>
              <Select value={form.project} onValueChange={v => setForm(f => ({ ...f, project: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground font-mono uppercase">Assignee</Label>
              <Select value={form.assignee} onValueChange={v => setForm(f => ({ ...f, assignee: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Me">Me</SelectItem>
                  <SelectItem value="ATLAS">ATLAS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-mono uppercase">Due Date</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => onCreate({ ...form, dueDate: form.dueDate || null })} disabled={!form.title}>
              Create Task
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
