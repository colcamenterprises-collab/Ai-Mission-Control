import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  getListTasksQueryKey,
  useListEvents,
  useListTasks,
  useMoveTask,
  type CalendarEvent,
  type Task,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  X,
} from "lucide-react";
import { AgentAvatar, agentTone } from "@/components/agent-avatar";
import { JamesAvatar } from "@/components/james-avatar";
import "./tasks.css";

type TaskMeta = Task & {
  recurrence?: string;
  approvalRequired?: boolean;
  unreadMessages?: number;
  attachments?: Array<{ name: string; url?: string }>;
  report?: string;
  archivedAt?: string | null;
};

type TaskMessage = { id: number; author: string; body: string; createdAt: string };
type TaskDetails = TaskMeta & { messages: TaskMessage[] };
type Project = { id: number; name: string };
type AutomationItem = { id: string; title: string; description: string; date: Date; schedule: string };
type ChatMessage = { role: "user" | "james" | "error"; content: string; timestamp: string };

const COLUMNS = [
  { id: "todo", label: "To-Do", matches: ["backlog", "ready"] },
  { id: "doing", label: "Doing", matches: ["running", "in_progress", "review", "blocked"] },
  { id: "done", label: "Done", matches: ["done"] },
] as const;

const CHAT_STORAGE_KEY = "mission-control:james-chat-history";

function authHeaders() {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
  };
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDueDate(value?: string | Date | null) {
  if (!value) return null;
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const { data: rawTasks = [], isLoading } = useListTasks();
  const { data: calendarEvents = [] } = useListEvents();
  const moveTask = useMoveTask();
  const tasks = rawTasks as TaskMeta[];
  const [selectedTask, setSelectedTask] = useState<TaskMeta | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  useEffect(() => {
    fetch("/api/projects", { headers: authHeaders() })
      .then((response) => (response.ok ? response.json() : []))
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  const approvalTasks = tasks.filter(
    (task) =>
      ["review", "blocked"].includes(task.status) ||
      Boolean(task.approvalRequired && ["running", "in_progress"].includes(task.status)),
  );

  function moveToColumn(event: DragEndEvent) {
    const taskId = Number(String(event.active.id).replace("task-", ""));
    const columnId = event.over?.id as (typeof COLUMNS)[number]["id"] | undefined;
    if (!taskId || !columnId || !COLUMNS.some((column) => column.id === columnId)) return;
    const status = columnId === "todo" ? "ready" : columnId === "doing" ? "running" : "done";
    moveTask.mutate(
      { id: taskId, data: { status: status as Task["status"] } },
      { onSuccess: invalidateTasks },
    );
  }

  return (
    <div className="mc-task-page">
      <header className="mc-task-header">
        <h1>Task</h1>
        <div className="mc-task-header-actions">
          {approvalTasks.length > 0 && (
            <button className="mc-task-approval-button" onClick={() => setSelectedTask(approvalTasks[0])}>
              <AlertTriangle aria-hidden="true" />
              <span>{approvalTasks.length} approval{approvalTasks.length === 1 ? "" : "s"}</span>
            </button>
          )}
          <button className="mc-task-primary-button" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            <span>Add Task</span>
          </button>
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={moveToColumn}>
        <main className="mc-task-workspace" aria-label="Tasks and automations">
          {COLUMNS.map((column) => (
            <TaskLane
              key={column.id}
              column={column}
              tasks={tasks.filter((task) => column.matches.includes(task.status as never))}
              loading={isLoading}
              onOpen={setSelectedTask}
            />
          ))}
          <aside className="mc-task-tools-column">
            <AutomationCalendar tasks={tasks} events={calendarEvents} />
            <OrchestratorChat />
          </aside>
        </main>
      </DndContext>

      <CreateTaskModal
        open={createOpen}
        projects={projects}
        onClose={() => setCreateOpen(false)}
        onCreated={async (project) => {
          setCreateOpen(false);
          if (project && !projects.some((item) => item.name === project)) {
            setProjects((current) => [...current, { id: Date.now(), name: project }]);
          }
          await invalidateTasks();
        }}
      />
      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onMove={(task, status) =>
          moveTask.mutate(
            { id: task.id, data: { status: status as Task["status"] } },
            {
              onSuccess: async () => {
                await invalidateTasks();
                setSelectedTask(null);
              },
            },
          )
        }
      />
    </div>
  );
}

function TaskLane({
  column,
  tasks,
  loading,
  onOpen,
}: {
  column: (typeof COLUMNS)[number];
  tasks: TaskMeta[];
  loading: boolean;
  onOpen: (task: TaskMeta) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section ref={setNodeRef} className={`mc-task-lane ${isOver ? "mc-task-lane-over" : ""}`}>
      <header className="mc-task-lane-header">
        <h2>{column.label}</h2>
        <span>{tasks.length}</span>
      </header>
      <div className="mc-task-lane-scroll">
        {loading ? (
          <>
            <div className="mc-task-card-skeleton" />
            <div className="mc-task-card-skeleton mc-task-card-skeleton-short" />
          </>
        ) : tasks.length > 0 ? (
          tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={() => onOpen(task)} />)
        ) : (
          <div className="mc-task-empty">No tasks</div>
        )}
      </div>
    </section>
  );
}

function TaskCard({ task, onOpen }: { task: TaskMeta; onOpen: () => void }) {
  const approval =
    ["review", "blocked"].includes(task.status) ||
    Boolean(task.approvalRequired && ["running", "in_progress"].includes(task.status));
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `task-${task.id}` });
  const dueDate = formatDueDate(task.dueDate);
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`mc-task-card mc-task-agent-${agentTone(task.assignee)} ${approval ? "mc-task-card-approval" : ""} ${isDragging ? "mc-task-card-dragging" : ""}`}
      onClick={onOpen}
      {...listeners}
      {...attributes}
    >
      {approval && (
        <span className="mc-task-card-alert">
          <AlertTriangle aria-hidden="true" /> Approval required
        </span>
      )}
      <h3>{task.title}</h3>
      {task.description && <p>{task.description}</p>}
      {dueDate && (
        <span className="mc-task-card-due">
          <Clock3 aria-hidden="true" /> {dueDate}
        </span>
      )}
      <footer>
        <div className="mc-task-card-metrics">
          <span><MessageCircle aria-hidden="true" /> {task.unreadMessages ?? 0}</span>
          {Boolean(task.attachments?.length) && <span><Paperclip aria-hidden="true" /> {task.attachments!.length}</span>}
        </div>
        {task.assignee?.toLowerCase().includes("james") ? (
          <JamesAvatar className="mc-task-card-avatar" />
        ) : (
          <AgentAvatar name={task.assignee} />
        )}
      </footer>
    </article>
  );
}

function OrchestratorChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) ?? "[]") as ChatMessage[];
    } catch {
      return [];
    }
  });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-20)));
  }, [messages]);

  async function send() {
    const content = message.trim();
    if (!content || sending) return;
    setMessages((current) => [...current, { role: "user", content, timestamp: new Date().toISOString() }]);
    setMessage("");
    setSending(true);
    try {
      const response = await fetch("/api/james/message", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ message: content }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        response?: string;
        stdout?: string;
        error?: string;
        details?: string;
      };
      const reply = result.response || result.stdout || result.error || result.details || "Message received.";
      setMessages((current) => [
        ...current,
        {
          role: response.ok && result.success !== false ? "james" : "error",
          content: reply,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "error", content: "Unable to reach the orchestrator.", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mc-task-chat">
      <header>
        <div className="mc-task-chat-person">
          <JamesAvatar className="mc-task-chat-avatar" />
          <div><h2>James</h2><span>Orchestrator</span></div>
        </div>
        <span className="mc-task-chat-status">Online</span>
      </header>
      <div className="mc-task-chat-messages">
        {messages.length > 0 ? (
          messages.slice(-8).map((item, index) => (
            <div key={`${item.timestamp}-${index}`} className={`mc-task-chat-message mc-task-chat-${item.role}`}>
              {item.content}
            </div>
          ))
        ) : (
          <div className="mc-task-chat-empty">Ask James about a task or automation.</div>
        )}
      </div>
      <div className="mc-task-chat-compose">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Message James"
          rows={1}
        />
        <button onClick={() => void send()} disabled={sending || !message.trim()} aria-label="Send message">
          <Send aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function AutomationCalendar({ tasks, events }: { tasks: TaskMeta[]; events: CalendarEvent[] }) {
  const [view, setView] = useState<"week" | "month">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<{ date: Date; items: AutomationItem[] } | null>(null);
  const today = new Date();

  const visibleDays = useMemo(() => {
    if (view === "week") {
      const start = new Date(cursor);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay());
      return Array.from({ length: 7 }, (_, index) =>
        new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
      );
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) =>
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index),
    );
  }, [cursor, view]);

  const itemsByDay = useMemo(() => {
    const result = new Map<string, AutomationItem[]>();
    const add = (item: AutomationItem) =>
      result.set(dateKey(item.date), [...(result.get(dateKey(item.date)) ?? []), item]);
    const automationEvents = events.filter((event) => event.category === "automation");

    for (const day of visibleDays) {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      for (const event of automationEvents) {
        const start = new Date(event.startDate);
        const end = event.endDate ? new Date(event.endDate) : start;
        if (start <= dayEnd && end >= dayStart) {
          add({
            id: `event-${event.id}`,
            title: event.title,
            description: event.description ?? "Automation event",
            date: day,
            schedule: start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          });
        }
      }

      for (const task of tasks.filter((item) => item.recurrence && item.recurrence !== "one_off" && item.dueDate)) {
        const due = new Date(task.dueDate!);
        const active =
          task.recurrence === "daily" ||
          (task.recurrence === "weekly" && due.getDay() === day.getDay()) ||
          (task.recurrence === "monthly" && due.getDate() === day.getDate());
        if (active && dayStart >= new Date(due.getFullYear(), due.getMonth(), due.getDate())) {
          add({
            id: `task-${task.id}`,
            title: task.title,
            description: task.description ?? "Recurring task",
            date: day,
            schedule: `${task.recurrence} · ${due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          });
        }
      }
    }
    return result;
  }, [events, tasks, visibleDays]);

  function navigate(direction: number) {
    setCursor((current) => {
      const next = new Date(current);
      if (view === "month") next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + 7 * direction);
      return next;
    });
  }

  const label =
    view === "month"
      ? cursor.toLocaleDateString([], { month: "long", year: "numeric" })
      : `${visibleDays[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${visibleDays[6].toLocaleDateString([], { month: "short", day: "numeric" })}`;

  return (
    <section className="mc-task-calendar">
      <header>
        <h2>Calendar</h2>
        <div className="mc-task-calendar-toggle">
          <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Week</button>
          <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Month</button>
        </div>
      </header>
      <div className="mc-task-calendar-nav">
        <button onClick={() => navigate(-1)} aria-label="Previous period"><ChevronLeft aria-hidden="true" /></button>
        <strong>{label}</strong>
        <button onClick={() => navigate(1)} aria-label="Next period"><ChevronRight aria-hidden="true" /></button>
      </div>
      <div className={`mc-task-calendar-grid mc-task-calendar-${view}`}>
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <span className="mc-task-calendar-weekday" key={`${day}-${index}`}>{day}</span>
        ))}
        {visibleDays.map((day) => {
          const items = itemsByDay.get(dateKey(day)) ?? [];
          const active = items.length > 0;
          const outside = view === "month" && day.getMonth() !== cursor.getMonth();
          const isToday = dateKey(day) === dateKey(today);
          return (
            <button
              key={dateKey(day)}
              className={`${active ? "active" : ""} ${outside ? "outside" : ""} ${isToday ? "today" : ""}`}
              onClick={() => active && setSelected({ date: day, items })}
              disabled={!active}
              aria-label={`${day.toLocaleDateString()}${active ? `, ${items.length} automation${items.length === 1 ? "" : "s"}` : ""}`}
            >
              <span>{day.getDate()}</span>
            </button>
          );
        })}
      </div>
      <div className="mc-task-calendar-legend"><span /> Active automation</div>
      <AutomationModal selection={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

function Modal({ children, className = "", onClose, label }: { children: ReactNode; className?: string; onClose: () => void; label: string }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="mc-task-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`mc-task-modal ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
        <button className="mc-task-modal-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
      </section>
    </div>,
    document.body,
  );
}

function CreateTaskModal({
  open,
  projects,
  onClose,
  onCreated,
}: {
  open: boolean;
  projects: Project[];
  onClose: () => void;
  onCreated: (project: string) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    recurrence: "one_off",
    project: "Mission Control",
    newProject: "",
    approvalRequired: false,
  });
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;
  const project = form.project === "__new" ? form.newProject.trim() : form.project;

  async function submit() {
    setError("");
    if (!form.title.trim() || !form.description.trim() || !project) {
      setError("Task title, description and project are required.");
      return;
    }
    setBusy(true);
    try {
      if (form.project === "__new") {
        const projectResponse = await fetch("/api/projects", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name: project }),
        });
        if (!projectResponse.ok && projectResponse.status !== 409) throw new Error("Unable to create project");
      }
      const dueDate = form.date ? new Date(`${form.date}T${form.time || "17:00"}`).toISOString() : null;
      const response = await fetch("/api/orchestrator/intake", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          project,
          dueDate,
          recurrence: form.recurrence,
          approvalRequired: form.approvalRequired,
          attachments: files.map((name) => ({ name })),
        }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "Unable to create task");
      }
      setForm({ title: "", description: "", date: "", time: "", recurrence: "one_off", project: "Mission Control", newProject: "", approvalRequired: false });
      setFiles([]);
      onCreated(project);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create task");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal className="mc-task-create-modal" onClose={onClose} label="Add Task">
      <header className="mc-task-modal-header"><h2>Add Task</h2><p>Give the orchestrator a clear outcome.</p></header>
      <div className="mc-task-form">
        <label className="mc-task-form-wide">Task Title<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="What needs to be completed?" autoFocus /></label>
        <label className="mc-task-form-wide">Description<textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Describe the result you need" /></label>
        <label>Due Date<input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label>
        <label>Due Time<input type="time" value={form.time} onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))} /></label>
        <label>Schedule<select value={form.recurrence} onChange={(event) => setForm((current) => ({ ...current, recurrence: event.target.value }))}><option value="one_off">One off</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label>Project<select value={form.project} onChange={(event) => setForm((current) => ({ ...current, project: event.target.value }))}><option>Mission Control</option>{projects.map((item) => <option key={item.id}>{item.name}</option>)}<option value="__new">Create a project</option></select></label>
        {form.project === "__new" && <label className="mc-task-form-wide">Project Name<input value={form.newProject} onChange={(event) => setForm((current) => ({ ...current, newProject: event.target.value }))} /></label>}
        <label className="mc-task-form-wide mc-task-upload">Attachments<input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).map((file) => file.name))} />{files.length > 0 && <small>{files.join(", ")}</small>}</label>
        <label className="mc-task-form-wide mc-task-checkbox"><input type="checkbox" checked={form.approvalRequired} onChange={(event) => setForm((current) => ({ ...current, approvalRequired: event.target.checked }))} /><span><strong>Owner approval</strong><small>Pause this task before the final action.</small></span></label>
        {error && <p className="mc-task-form-error mc-task-form-wide">{error}</p>}
      </div>
      <footer className="mc-task-modal-footer"><button className="mc-task-secondary-button" onClick={onClose}>Cancel</button><button className="mc-task-primary-button" onClick={() => void submit()} disabled={busy}>{busy ? "Adding…" : "Add Task"}</button></footer>
    </Modal>
  );
}

function AutomationModal({ selection, onClose }: { selection: { date: Date; items: AutomationItem[] } | null; onClose: () => void }) {
  if (!selection) return null;
  return (
    <Modal className="mc-task-automation-modal" onClose={onClose} label="Automation details">
      <header className="mc-task-modal-header"><span className="mc-task-modal-kicker">Automations</span><h2>{selection.date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h2></header>
      <div className="mc-task-automation-list">
        {selection.items.map((item) => <article key={item.id}><div><h3>{item.title}</h3><span>{item.schedule}</span></div><p>{item.description}</p></article>)}
      </div>
    </Modal>
  );
}

function TaskDetailModal({ task, onClose, onMove }: { task: TaskMeta | null; onClose: () => void; onMove: (task: TaskMeta, status: string) => void }) {
  const [details, setDetails] = useState<TaskDetails | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setDetails(null);
    if (!task) return;
    fetch(`/api/tasks/${task.id}/details`, { headers: authHeaders() })
      .then((response) => response.json())
      .then(setDetails)
      .catch(() => setDetails({ ...task, messages: [] }));
  }, [task]);

  if (!task) return null;
  const value = details ?? ({ ...task, messages: [] } as TaskDetails);
  const taskId = task.id;
  const doing = ["running", "in_progress", "review", "blocked"].includes(value.status);

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ body: message }),
      });
      if (response.ok) {
        const created = (await response.json()) as TaskMessage;
        setDetails((current) => current ? { ...current, messages: [...current.messages, created] } : current);
        setMessage("");
      }
    } finally {
      setSending(false);
    }
  }

  const statusLabel = COLUMNS.find((column) => column.matches.includes(value.status as never))?.label ?? value.status;
  return (
    <Modal className="mc-task-detail-modal" onClose={onClose} label={value.title}>
      <header className="mc-task-modal-header"><span className="mc-task-modal-kicker">{statusLabel}</span><h2>{value.title}</h2></header>
      <div className="mc-task-detail-layout">
        <main>
          <p className="mc-task-detail-description">{value.description || "No description provided."}</p>
          <dl className="mc-task-detail-meta">
            <div><dt>Agent</dt><dd>{value.assignee || "Orchestrator"}</dd></div>
            <div><dt>Project</dt><dd>{value.project || "Mission Control"}</dd></div>
            <div><dt>Due</dt><dd>{formatDueDate(value.dueDate) || "Not set"}</dd></div>
            <div><dt>Schedule</dt><dd>{value.recurrence?.replace("_", " ") || "One off"}</dd></div>
          </dl>
          <section className="mc-task-detail-section"><h3>Agent Report</h3><p>{value.report || (doing ? "The orchestrator is collecting progress and agent reports for this task." : value.status === "done" ? "Task completed and archived with its project record." : "No report has been submitted yet.")}</p></section>
          {Boolean(value.attachments?.length) && <section className="mc-task-detail-section"><h3>Attachments</h3><div className="mc-task-attachment-list">{value.attachments!.map((attachment, index) => <span key={`${attachment.name}-${index}`}><Paperclip aria-hidden="true" /> {attachment.name}</span>)}</div></section>}
        </main>
        <aside className="mc-task-conversation">
          <header><JamesAvatar className="mc-task-conversation-avatar" /><div><h3>Task Conversation</h3><span>Messages route through James</span></div></header>
          <div className="mc-task-conversation-messages">{value.messages.length > 0 ? value.messages.map((item) => <article key={item.id}><strong>{item.author}</strong><p>{item.body}</p><time>{new Date(item.createdAt).toLocaleString()}</time></article>) : <p className="mc-task-conversation-empty">No messages yet.</p>}</div>
          <div className="mc-task-conversation-compose"><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Add a message" rows={2} /><button onClick={() => void send()} disabled={sending || !message.trim()} aria-label="Send message"><Send aria-hidden="true" /></button></div>
        </aside>
      </div>
      <footer className="mc-task-modal-footer mc-task-detail-footer">{value.status === "done" ? <span className="mc-task-archived"><Check aria-hidden="true" /> Archived in {value.project}</span> : <><button className="mc-task-secondary-button" onClick={() => onMove(value, "running")}>Move to Doing</button><button className="mc-task-primary-button" onClick={() => onMove(value, "done")}>Mark Done</button></>}</footer>
    </Modal>
  );
}
