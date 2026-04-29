import { useState } from "react";
import { useListTasks, useCreateTask, useUpdateTask, useDeleteTask, useMoveTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Task } from "@workspace/api-client-react";
import { Plus, X, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const COLUMNS = [
  { id: "backlog", label: "Backlog" },
  { id: "in_progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/20 text-blue-400",
  high: "bg-yellow-500/20 text-yellow-400",
  urgent: "bg-destructive/20 text-destructive",
};

const PROJECTS = ["Strategy", "Content", "Infrastructure", "Education", "Marketing"];

export default function Tasks() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState({ priority: "all", assignee: "all", project: "all" });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const { data: tasks, isLoading } = useListTasks();
  const moveTask = useMoveTask();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const filteredTasks = (tasks ?? []).filter(t => {
    if (filter.priority !== "all" && t.priority !== filter.priority) return false;
    if (filter.assignee !== "all" && t.assignee !== filter.assignee) return false;
    if (filter.project !== "all" && t.project !== filter.project) return false;
    return true;
  });

  const tasksByColumn = (col: string) => filteredTasks.filter(t => t.status === col);

  const handleDrop = (status: string) => {
    if (draggedId == null) return;
    moveTask.mutate({ id: draggedId, data: { status: status as Task["status"] } }, {
      onSuccess: invalidate,
    });
    setDraggedId(null);
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
                {[1,2,3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-4 h-full">
            {COLUMNS.map(col => (
              <div
                key={col.id}
                className="w-72 flex-shrink-0 flex flex-col bg-card/50 rounded-lg border border-border"
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(col.id)}
              >
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <span className="font-mono text-xs uppercase text-muted-foreground">{col.label}</span>
                  <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded">{tasksByColumn(col.id).length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {tasksByColumn(col.id).map(task => (
                    <div
                      key={task.id}
                      className="bg-card border border-border rounded p-3 cursor-pointer hover:border-primary/50 transition-colors"
                      draggable
                      onDragStart={() => setDraggedId(task.id)}
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-medium leading-snug flex-1 mr-2">{task.title}</p>
                        <Badge className={`text-xs px-1.5 py-0 ${PRIORITY_COLORS[task.priority]}`}>
                          {task.priority}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-mono">{task.assignee}</span>
                        <span className="bg-secondary px-1.5 py-0.5 rounded">{task.project}</span>
                      </div>
                      {task.dueDate && (
                        <div className="mt-2 text-xs text-muted-foreground font-mono">
                          Due: {new Date(task.dueDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={o => !o && setSelectedTask(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono">{selectedTask?.title}</DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Assignee</label>
                  <p className="mt-1">{selectedTask.assignee}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Priority</label>
                  <p className="mt-1"><Badge className={`text-xs ${PRIORITY_COLORS[selectedTask.priority]}`}>{selectedTask.priority}</Badge></p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Project</label>
                  <p className="mt-1">{selectedTask.project}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Status</label>
                  <p className="mt-1 capitalize">{selectedTask.status.replace("_", " ")}</p>
                </div>
              </div>
              {selectedTask.description && (
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Description</label>
                  <p className="mt-1 text-muted-foreground">{selectedTask.description}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="destructive" size="sm" onClick={() => {
                  deleteTask.mutate({ id: selectedTask.id }, { onSuccess: () => { invalidate(); setSelectedTask(null); } });
                }}>Delete</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedTask(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      <CreateTaskDialog open={showCreate} onClose={() => setShowCreate(false)} onCreate={(data) => {
        createTask.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } });
      }} />
    </div>
  );
}

function CreateTaskDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (data: any) => void }) {
  const [form, setForm] = useState({ title: "", description: "", assignee: "Me", priority: "medium", status: "backlog", project: "Strategy", dueDate: "" });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono">New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Input placeholder="Task title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <Textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["low","medium","high","urgent"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.project} onValueChange={v => setForm(f => ({ ...f, project: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.assignee} onValueChange={v => setForm(f => ({ ...f, assignee: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Me">Me</SelectItem>
                <SelectItem value="ATLAS">ATLAS</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onCreate({ ...form, dueDate: form.dueDate || null })} disabled={!form.title}>Create</Button>
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
