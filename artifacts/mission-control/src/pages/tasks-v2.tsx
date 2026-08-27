import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { getListTasksQueryKey, type Task } from "@workspace/api-client-react";
import { AlertTriangle, Check, Clock3, MessageCircle, Paperclip, Plus, Send, X } from "lucide-react";
import { AgentAvatar, agentTone } from "@/components/agent-avatar";
import { JamesAvatar } from "@/components/james-avatar";
import "./tasks.css";
import "./tasks-final.css";
import "./task-timeline.css";
import "./tasks-v2.css";

type TaskMeta = Task & {
  recurrence?: string;
  approvalRequired?: boolean;
  ownerReviewRequired?: boolean;
  unreadMessages?: number;
  attachments?: Array<{ name: string; url?: string }>;
  report?: string;
  archivedAt?: string | null;
  createdAt?: string | Date;
};
type TaskMessage = { id: number; author: string; body: string; createdAt: string };
type TaskDetails = TaskMeta & { messages: TaskMessage[] };
type InboxItem = { id: number; title: string | null; content: string; reviewStatus: string; linkedTaskId: number | null; linkedProjectId: number | null };
type Project = { id: number; name: string };

const COLUMNS = [
  { id: "doing", label: "Doing", matches: ["backlog", "ready", "running", "in_progress", "completion_pending"] },
  { id: "changes", label: "Changes Required", matches: ["changes_required", "blocked"] },
  { id: "done", label: "Done", matches: ["review", "done"] },
] as const;
type ColumnId = (typeof COLUMNS)[number]["id"];

function authHeaders() {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}) };
}
function needsApproval(task: TaskMeta) { return task.status !== "done" && Boolean(task.approvalRequired); }
function formatDueDate(value?: string | Date | null) { return value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : null; }
function columnFor(status: string) { return COLUMNS.find((column) => column.matches.includes(status as never)); }
function newestFirst(a: TaskMeta, b: TaskMeta) { return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime() || Number(b.id) - Number(a.id); }

export default function TasksV2() {
  const queryClient = useQueryClient();
  const [tasks, setTasks] = useState<TaskMeta[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<TaskMeta | null>(null);
  const [activeTask, setActiveTask] = useState<TaskMeta | null>(null);
  const [activeWidth, setActiveWidth] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [boardError, setBoardError] = useState("");
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 10 } }),
  );

  async function refreshTasks() {
    const response = await fetch("/api/tasks", { headers: authHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load tasks");
    const next = await response.json() as TaskMeta[];
    setTasks(next.filter((task) => !task.archivedAt).sort(newestFirst));
    await queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
  }
  async function refreshInbox() {
    const response = await fetch("/api/inbox", { headers: authHeaders(), cache: "no-store" });
    setInbox(response.ok ? await response.json() as InboxItem[] : []);
  }
  async function refreshProjects() {
    const response = await fetch("/api/projects", { headers: authHeaders(), cache: "no-store" });
    setProjects(response.ok ? await response.json() as Project[] : []);
  }

  useEffect(() => {
    void Promise.all([refreshTasks(), refreshInbox(), refreshProjects()])
      .catch((error) => setBoardError(error instanceof Error ? error.message : "Unable to load Kanban"))
      .finally(() => setLoading(false));
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "task") setCreateOpen(true);
    if (params.get("create") === "note") setNoteOpen(true);
  }, []);

  const approvalTasks = tasks.filter(needsApproval);
  const tasksByColumn = useMemo(
    () => Object.fromEntries(COLUMNS.map((column) => [column.id, tasks.filter((task) => column.matches.includes(task.status as never)).sort(newestFirst)])) as Record<ColumnId, TaskMeta[]>,
    [tasks],
  );

  function handleDragStart(event: DragStartEvent) {
    setBoardError("");
    const taskId = Number(String(event.active.id).replace("task-", ""));
    setActiveTask(tasks.find((task) => Number(task.id) === taskId) ?? null);
    setActiveWidth(event.active.rect.current.initial?.width ?? null);
  }
  function handleDragCancel(_event: DragCancelEvent) { setActiveTask(null); setActiveWidth(null); }
  async function handleDragEnd(event: DragEndEvent) {
    const dragged = activeTask;
    setActiveTask(null);
    setActiveWidth(null);
    if (!dragged) return;
    const destination = event.over?.id as ColumnId | undefined;
    if (!destination || !COLUMNS.some((column) => column.id === destination)) return;
    const source = columnFor(String(dragged.status))?.id;
    if (source === destination) return;
    if (destination === "done") {
      setBoardError("Done is controlled by verification and owner sign-off. Open the task to complete that workflow.");
      return;
    }
    const nextStatus = destination === "changes" ? "changes_required" : "running";
    const before = tasks;
    setTasks((current) => current.map((task) => Number(task.id) === Number(dragged.id) ? { ...task, status: nextStatus as Task["status"] } : task).sort(newestFirst));
    const response = await fetch(`/api/tasks/${dragged.id}/move`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status: nextStatus }) });
    if (!response.ok) {
      setTasks(before);
      const body = await response.json().catch(() => ({})) as { error?: string };
      setBoardError(body.error || "Mission Control rejected that move. The task was returned to its previous lane.");
      return;
    }
    await refreshTasks();
  }

  return <div className="mc-task-page mc-kanban-v2">
    <header className="mc-task-header">
      <div><span className="mc-task-header-kicker">Mission Control</span><h1>Kanban</h1></div>
      <div className="mc-task-header-actions">
        {approvalTasks.length > 0 && <button className="mc-task-approval-button" onClick={() => setSelectedTask(approvalTasks[0])}><AlertTriangle />{approvalTasks.length} owner action{approvalTasks.length === 1 ? "" : "s"}</button>}
        <button className="mc-task-secondary-button" onClick={() => setNoteOpen(true)}><Plus />Add Idea</button>
        <button className="mc-task-primary-button" onClick={() => setCreateOpen(true)}><Plus />Add Task</button>
      </div>
    </header>
    {boardError && <div className="mc-kanban-v2-error" role="alert"><AlertTriangle />{boardError}<button onClick={() => setBoardError("")} aria-label="Dismiss"><X /></button></div>}
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragCancel={handleDragCancel} onDragEnd={(event) => void handleDragEnd(event)}>
      <main className="mc-task-workspace mc-kanban-v2-board" aria-label="Mission Control Kanban">
        <InboxLane items={inbox} onChanged={() => void refreshInbox()} />
        {COLUMNS.map((column) => <TaskLane key={column.id} column={column} tasks={tasksByColumn[column.id]} loading={loading} onOpen={setSelectedTask} />)}
      </main>
      <DragOverlay dropAnimation={null} zIndex={100000}>
        {activeTask ? <TaskCardVisual task={activeTask} overlay width={activeWidth ?? undefined} /> : null}
      </DragOverlay>
    </DndContext>
    <CreateTaskModal open={createOpen} projects={projects} onClose={() => setCreateOpen(false)} onCreated={async () => { setCreateOpen(false); await Promise.all([refreshTasks(), refreshProjects()]); }} />
    <CreateNoteModal open={noteOpen} onClose={() => setNoteOpen(false)} onCreated={async () => { setNoteOpen(false); await refreshInbox(); }} />
    {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} onChanged={refreshTasks} />}
  </div>;
}

function TaskLane({ column, tasks, loading, onOpen }: { column: (typeof COLUMNS)[number]; tasks: TaskMeta[]; loading: boolean; onOpen: (task: TaskMeta) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return <section ref={setNodeRef} className={`mc-task-lane mc-task-lane-${column.id} ${isOver ? "mc-task-lane-over" : ""}`} data-kanban-lane={column.id}>
    <header className="mc-task-lane-header"><h2>{column.label}</h2><span>{tasks.length}</span></header>
    <div className="mc-task-lane-scroll">{loading ? <><div className="mc-task-card-skeleton" /><div className="mc-task-card-skeleton mc-task-card-skeleton-short" /></> : tasks.length ? tasks.map((task) => <DraggableTaskCard key={task.id} task={task} onOpen={() => onOpen(task)} />) : <div className="mc-task-empty">No tasks</div>}</div>
  </section>;
}

function DraggableTaskCard({ task, onOpen }: { task: TaskMeta; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task-${task.id}` });
  return <div ref={setNodeRef} className={`mc-kanban-v2-card-shell ${isDragging ? "is-dragging" : ""}`}>
    <TaskCardVisual task={task} onOpen={onOpen} dragProps={{ ...attributes, ...listeners }} />
  </div>;
}

function TaskCardVisual({ task, onOpen, dragProps, overlay = false, width }: { task: TaskMeta; onOpen?: () => void; dragProps?: any; overlay?: boolean; width?: number }) {
  const dueDate = formatDueDate(task.dueDate);
  const approval = needsApproval(task);
  const tone = Math.abs(Number(task.id)) % 4;
  return <article
    className={`mc-task-card mc-task-card-tone-${tone} mc-task-agent-${agentTone(task.assignee)} ${approval ? "mc-task-card-approval" : ""} ${overlay ? "mc-kanban-v2-overlay-card" : ""}`}
    onClick={onOpen}
    style={width ? { width } : undefined}
    {...dragProps}
  >
    {approval && <span className="mc-task-card-alert"><AlertTriangle /> Owner action required</span>}
    <h3>{task.title}</h3>
    {task.description && <p>{task.description}</p>}
    {dueDate && <span className="mc-task-card-due"><Clock3 /> {dueDate}</span>}
    <footer><div className="mc-task-card-metrics">{(task.unreadMessages ?? 0) > 0 && <span><MessageCircle /> {task.unreadMessages}</span>}{Boolean(task.attachments?.length) && <span><Paperclip /> {task.attachments!.length}</span>}</div>{task.assignee?.toLowerCase().includes("james") ? <JamesAvatar className="mc-task-card-avatar" /> : <AgentAvatar name={task.assignee} />}</footer>
  </article>;
}

function InboxLane({ items, onChanged }: { items: InboxItem[]; onChanged: () => void }) {
  async function update(id: number, path: string) { await fetch(`/api/inbox/${id}${path}`, { method: "POST", headers: authHeaders() }); onChanged(); }
  return <section className="mc-task-lane mc-inbox-lane"><header className="mc-task-lane-header"><div><h2>Ideas &amp; To-Do</h2><small>Capture only · no execution until Make Task</small></div><span>{items.length}</span></header><div className="mc-task-lane-scroll">{items.length ? items.map((item, index) => <article className={`mc-task-card mc-task-card-tone-${index % 4}`} key={item.id}><h3>{item.title || "Untitled idea"}</h3><p className="mc-inbox-content">{item.content}</p><footer className="mc-inbox-actions"><button disabled={Boolean(item.linkedTaskId)} onClick={() => void update(item.id, "/convert")}>{item.linkedTaskId ? `Task #${item.linkedTaskId}` : "Make Task"}</button><button onClick={() => void update(item.id, "/archive")}>Archive</button></footer></article>) : <div className="mc-task-empty">No ideas captured</div>}</div></section>;
}

function Modal({ children, className = "", onClose, label }: { children: ReactNode; className?: string; onClose: () => void; label: string }) {
  useEffect(() => { const fn = (event: KeyboardEvent) => event.key === "Escape" && onClose(); document.addEventListener("keydown", fn); return () => document.removeEventListener("keydown", fn); }, [onClose]);
  return createPortal(<div className="mc-task-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`mc-task-modal ${className}`} role="dialog" aria-modal="true" aria-label={label}>{children}<button className="mc-task-modal-close" onClick={onClose} aria-label="Close"><X /></button></section></div>, document.body);
}

function CreateTaskModal({ open, projects, onClose, onCreated }: { open: boolean; projects: Project[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", date: "", time: "", recurrence: "one_off", project: "Mission Control", newProject: "", approvalRequired: false, ownerReviewRequired: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;
  const project = form.project === "__new" ? form.newProject.trim() : form.project;
  async function submit() {
    setError("");
    if (!form.title.trim() || !form.description.trim() || !project) { setError("Task title, description and project are required."); return; }
    setBusy(true);
    try {
      if (form.project === "__new") {
        const projectResponse = await fetch("/api/projects", { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: project }) });
        if (!projectResponse.ok && projectResponse.status !== 409) throw new Error("Unable to create project");
      }
      const dueDate = form.date ? new Date(`${form.date}T${form.time || "17:00"}`).toISOString() : null;
      const response = await fetch("/api/orchestrator/intake", { method: "POST", headers: authHeaders(), body: JSON.stringify({ title: form.title.trim(), description: form.description.trim(), project, dueDate, recurrence: form.recurrence, approvalRequired: form.approvalRequired, ownerReviewRequired: form.ownerReviewRequired }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || "Unable to create task"); }
      setForm({ title: "", description: "", date: "", time: "", recurrence: "one_off", project: "Mission Control", newProject: "", approvalRequired: false, ownerReviewRequired: false });
      onCreated();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create task"); }
    finally { setBusy(false); }
  }
  return <Modal className="mc-task-create-modal" onClose={onClose} label="Add Task"><header className="mc-task-modal-header"><h2>Add Task</h2><p>Create one canonical Mission Control task.</p></header><div className="mc-task-form">
    <label className="mc-task-form-wide">Task Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></label>
    <label className="mc-task-form-wide">Description<textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
    <label>Due Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label>Due Time<input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
    <label>Schedule<select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}><option value="one_off">One off</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
    <label>Project<select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}><option>Mission Control</option>{projects.map((item) => <option key={item.id}>{item.name}</option>)}<option value="__new">Create a project</option></select></label>
    {form.project === "__new" && <label className="mc-task-form-wide">Project Name<input value={form.newProject} onChange={(e) => setForm({ ...form, newProject: e.target.value })} /></label>}
    <label className="mc-task-form-wide mc-task-checkbox"><input type="checkbox" checked={form.approvalRequired} onChange={(e) => setForm({ ...form, approvalRequired: e.target.checked })} /><span><strong>Approval Required</strong><small>Permission before a protected action.</small></span></label>
    <label className="mc-task-form-wide mc-task-checkbox"><input type="checkbox" checked={form.ownerReviewRequired} onChange={(e) => setForm({ ...form, ownerReviewRequired: e.target.checked })} /><span><strong>Owner Review Required</strong><small>Human acceptance after verification.</small></span></label>
    {error && <p className="mc-task-form-error mc-task-form-wide">{error}</p>}
  </div><footer className="mc-task-modal-footer"><button className="mc-task-secondary-button" onClick={onClose}>Cancel</button><button className="mc-task-primary-button" onClick={() => void submit()} disabled={busy}>{busy ? "Adding…" : "Add Task"}</button></footer></Modal>;
}

function CreateNoteModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!open) return null;
  async function save() {
    if (!content.trim()) { setError("Note content is required."); return; }
    setBusy(true);
    const response = await fetch("/api/inbox", { method: "POST", headers: authHeaders(), body: JSON.stringify({ title: title.trim() || null, content, source: "typed", createdBy: "Owner" }) });
    setBusy(false);
    if (!response.ok) { setError("Unable to save idea."); return; }
    setTitle(""); setContent(""); onCreated();
  }
  return <Modal className="mc-task-create-modal" onClose={onClose} label="Add Idea"><header className="mc-task-modal-header"><h2>Add Idea</h2><p>Capture only. Nothing executes until Make Task.</p></header><div className="mc-task-form"><label className="mc-task-form-wide">Title (optional)<input value={title} onChange={(e) => setTitle(e.target.value)} /></label><label className="mc-task-form-wide">Note<textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} /></label>{error && <p className="mc-task-form-error">{error}</p>}</div><footer className="mc-task-modal-footer"><button className="mc-task-secondary-button" onClick={onClose}>Cancel</button><button className="mc-task-primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save Idea"}</button></footer></Modal>;
}

function TaskDetailModal({ task, onClose, onChanged }: { task: TaskMeta; onClose: () => void; onChanged: () => Promise<void> }) {
  const taskId = Number(task.id);
  const [details, setDetails] = useState<TaskDetails | null>(null);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDetails(null); setError(""); setNote(""); setChecked(false);
    void fetch(`/api/tasks/${taskId}/details`, { headers: authHeaders(), cache: "no-store" }).then(async (response) => { if (response.ok && !cancelled) setDetails(await response.json() as TaskDetails); });
    return () => { cancelled = true; };
  }, [taskId]);

  const value = details ?? ({ ...task, messages: [] } as TaskDetails);

  async function postAction(path: string, body: object = {}) {
    const response = await fetch(`/api/tasks/${taskId}/${path}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
    if (!response.ok) { const result = await response.json().catch(() => ({})) as { error?: string }; throw new Error(result.error || `Unable to ${path}`); }
  }
  async function action(path: string, body: object = {}) {
    setBusy(true); setError("");
    try { await postAction(path, body); await onChanged(); onClose(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Action failed"); }
    finally { setBusy(false); }
  }
  async function requestChanges() {
    if (!note.trim()) { setError("Add a factual change request first."); return; }
    setBusy(true); setError("");
    try {
      await postAction("request-changes", { note });
      const move = await fetch(`/api/tasks/${taskId}/move`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status: "changes_required" }) });
      if (!move.ok) { const result = await move.json().catch(() => ({})) as { error?: string }; throw new Error(result.error || "Change request was recorded but the task could not move to Changes Required"); }
      await onChanged(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to request changes"); }
    finally { setBusy(false); }
  }
  async function accept() {
    setBusy(true); setError("");
    try {
      await postAction("accept", { note });
      await postAction("archive");
      await onChanged(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to accept work"); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!message.trim()) return;
    setBusy(true); setError("");
    try {
      await postAction("messages", { body: message.trim() });
      setMessage("");
      const fresh = await fetch(`/api/tasks/${taskId}/details`, { headers: authHeaders(), cache: "no-store" });
      if (fresh.ok) setDetails(await fresh.json() as TaskDetails);
      await onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to add task note"); }
    finally { setBusy(false); }
  }

  return <Modal className="mc-task-detail-modal mc-task-timeline-modal" onClose={onClose} label={value.title}>
    <header className="mc-task-modal-header"><span className="mc-task-modal-kicker">{columnFor(String(value.status))?.label ?? value.status}</span><h2>{value.title}</h2></header>
    <div className="mc-task-detail-layout mc-task-timeline-layout">
      <main className="mc-task-summary-pane"><p className="mc-task-detail-description">{value.description || "No description provided."}</p><dl className="mc-task-detail-meta"><div><dt>Agent</dt><dd>{value.assignee || "Orchestrator"}</dd></div><div><dt>Project</dt><dd>{value.project || "Mission Control"}</dd></div><div><dt>Due</dt><dd>{formatDueDate(value.dueDate) || "Not set"}</dd></div><div><dt>Status</dt><dd>{String(value.status)}</dd></div></dl>{value.report && <section className="mc-task-detail-section"><h3>Agent Report</h3><p>{value.report}</p></section>}</main>
      <aside className="mc-task-conversation mc-task-timeline"><header><JamesAvatar className="mc-task-conversation-avatar" /><div><h3>Task Timeline & Notes</h3><span>Permanent task record</span></div></header><div className="mc-task-conversation-messages mc-task-timeline-items">
        {value.messages.length ? value.messages.map((item) => <article key={item.id} className="mc-task-timeline-item mc-task-timeline-system"><div className="mc-task-timeline-topline"><span className="mc-task-timeline-event">NOTE</span><time>{new Date(item.createdAt).toLocaleString()}</time></div><strong>{item.author}</strong><p>{item.body}</p></article>) : <p className="mc-task-conversation-empty">No timeline entries yet.</p>}
        {needsApproval(value) && <section className="mc-task-approval-panel"><div className="mc-task-approval-heading"><AlertTriangle /><div><strong>Owner action required</strong><span>Review before releasing this action.</span></div></div><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Approval note or requested changes" /><label className="mc-task-approval-check"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /><span>I approve this action</span></label><div className="mc-task-approval-actions"><button className="mc-task-secondary-button" onClick={() => void requestChanges()} disabled={busy}>Request Changes</button><button className="mc-task-primary-button" onClick={() => void action("approve", { note: note.trim() || "Approved to continue." })} disabled={busy || !checked}><Check />Approve & Continue</button></div></section>}
        {value.status === "review" && <section className="mc-task-approval-panel"><div className="mc-task-approval-heading"><Check /><div><strong>Verified complete · owner sign-off</strong></div></div><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Required for changes; optional for acceptance" /><div className="mc-task-approval-actions"><button className="mc-task-secondary-button" onClick={() => void requestChanges()} disabled={busy || !note.trim()}>Request Changes</button><button className="mc-task-primary-button" onClick={() => void accept()} disabled={busy}><Check />Accept & Archive</button></div></section>}
      </div><div className="mc-task-conversation-compose"><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Add a note inside this task" /><button onClick={() => void send()} disabled={busy || !message.trim()}><Send /></button></div></aside>
    </div>
    {error && <p className="mc-task-form-error mc-task-action-error">{error}</p>}
  </Modal>;
}
