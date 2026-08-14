import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Archive, Check, FileUp, Lightbulb, MessageCircle, Mic, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { JamesAvatar } from "@/components/james-avatar";
import { AgentAvatar } from "@/components/agent-avatar";
import "./tasks.css";
import "./tasks-v2.css";

type Attachment = { name: string; url?: string; mimeType?: string; uploadedBy?: string; uploadedAt?: string };
type Task = {
  id: number;
  title: string;
  description?: string | null;
  assignee: string;
  priority: string;
  status: string;
  project: string;
  dueDate?: string | null;
  recurrence?: string;
  approvalRequired?: boolean;
  unreadMessages?: number;
  attachments?: Attachment[];
  report?: string | null;
  archivedAt?: string | null;
  createdAt?: string;
};
type TaskMessage = { id: number; author: string; body: string; createdAt: string };
type TaskDetails = Task & { messages: TaskMessage[] };
type Idea = { id: number; title: string; notes: string; attachments: Attachment[]; createdAt: string; updatedAt: string };
type Project = { id: number; name: string };

type Lane = { id: "doing" | "changes" | "done"; label: string; statuses: string[] };
const LANES: Lane[] = [
  { id: "doing", label: "Doing", statuses: ["backlog", "ready", "running", "in_progress", "review", "pending"] },
  { id: "changes", label: "Changes Required", statuses: ["blocked", "changes_required"] },
  { id: "done", label: "Done", statuses: ["done", "completed"] },
];

function authHeaders(json = true): Record<string, string> {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
  };
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function Modal({ children, onClose, label, className = "" }: { children: ReactNode; onClose: () => void; label: string; className?: string }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  return createPortal(
    <div className="mc-task-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`mc-task-modal ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
        <button className="mc-task-modal-close" onClick={onClose} aria-label="Close"><X /></button>
      </section>
    </div>,
    document.body,
  );
}

function useVoiceInput(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  function start() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { window.alert("Voice transcription is not supported by this browser."); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-AU";
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<any>).map((result: any) => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript) onText(transcript);
    };
    recognition.start();
  }
  return { listening, start };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

export default function TasksV2() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createIdeaOpen, setCreateIdeaOpen] = useState(false);
  const ownerActions = tasks.filter(task => Boolean(task.approvalRequired) || ["done", "completed"].includes(task.status));

  async function refresh() {
    try {
      const [taskData, ideaData, projectData] = await Promise.all([
        jsonFetch<Task[]>("/api/tasks"),
        jsonFetch<Idea[]>("/api/ideas"),
        jsonFetch<Project[]>("/api/projects"),
      ]);
      setTasks(taskData);
      setIdeas(ideaData);
      setProjects(projectData);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mc-task-page mc-v2-page">
      <header className="mc-task-header">
        <div><h1>Mission Control</h1><p className="mc-v2-subtitle">Ideas stay as notes. Executable work starts in Doing. James owns orchestration.</p></div>
        <div className="mc-task-header-actions">
          {ownerActions.length > 0 && <span className="mc-v2-owner-action">{ownerActions.length} owner action{ownerActions.length === 1 ? "" : "s"}</span>}
          <button className="mc-task-secondary-button" onClick={() => setCreateIdeaOpen(true)}><Lightbulb /> Add Idea</button>
          <button className="mc-task-primary-button" onClick={() => setCreateTaskOpen(true)}><Plus /> Add Task</button>
        </div>
      </header>

      <main className="mc-v2-board">
        <IdeasLane ideas={ideas} loading={loading} onOpen={setSelectedIdea} onAdd={() => setCreateIdeaOpen(true)} />
        {LANES.map(lane => (
          <TaskLane key={lane.id} lane={lane} loading={loading} tasks={tasks.filter(task => lane.statuses.includes(task.status))} onOpen={setSelectedTask} />
        ))}
      </main>

      {createTaskOpen && <CreateTaskModal projects={projects} onClose={() => setCreateTaskOpen(false)} onCreated={async () => { setCreateTaskOpen(false); await refresh(); }} />}
      {createIdeaOpen && <CreateIdeaModal onClose={() => setCreateIdeaOpen(false)} onCreated={async () => { setCreateIdeaOpen(false); await refresh(); }} />}
      {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} onChanged={async () => { await refresh(); }} />}
      {selectedIdea && <IdeaDetailModal idea={selectedIdea} projects={projects} onClose={() => setSelectedIdea(null)} onChanged={async () => { setSelectedIdea(null); await refresh(); }} />}
    </div>
  );
}

function IdeasLane({ ideas, loading, onOpen, onAdd }: { ideas: Idea[]; loading: boolean; onOpen: (idea: Idea) => void; onAdd: () => void }) {
  return <section className="mc-task-lane mc-v2-ideas-lane">
    <header className="mc-task-lane-header"><h2>Ideas & To-Do</h2><span>{ideas.length}</span></header>
    <p className="mc-v2-lane-help">Notebook only — nothing here is allocated or executed.</p>
    <div className="mc-task-lane-scroll">
      {loading ? <div className="mc-task-card-skeleton" /> : ideas.map(idea => (
        <article className="mc-task-card mc-v2-idea-card" key={idea.id} onClick={() => onOpen(idea)}>
          <span className="mc-v2-note-chip">NOTE</span><h3>{idea.title}</h3><p>{idea.notes || "No notes yet."}</p>
          <footer><span><Paperclip /> {idea.attachments?.length ?? 0}</span><Lightbulb /></footer>
        </article>
      ))}
      {!loading && ideas.length === 0 && <button className="mc-v2-empty-action" onClick={onAdd}>Capture your first idea</button>}
    </div>
  </section>;
}

function TaskLane({ lane, tasks, loading, onOpen }: { lane: Lane; tasks: Task[]; loading: boolean; onOpen: (task: Task) => void }) {
  return <section className={`mc-task-lane mc-v2-lane-${lane.id}`}>
    <header className="mc-task-lane-header"><h2>{lane.label}</h2><span>{tasks.length}</span></header>
    <div className="mc-task-lane-scroll">
      {loading ? <div className="mc-task-card-skeleton" /> : tasks.map(task => (
        <article className={`mc-task-card ${task.approvalRequired ? "mc-task-card-approval" : ""}`} key={task.id} onClick={() => onOpen(task)}>
          {task.approvalRequired && <span className="mc-task-card-alert">Owner action required</span>}
          <h3>{task.title}</h3><p>{task.description}</p>
          <footer><div className="mc-task-card-metrics"><span><MessageCircle /> {task.unreadMessages ?? 0}</span>{Boolean(task.attachments?.length) && <span><Paperclip /> {task.attachments!.length}</span>}</div>{task.assignee?.toLowerCase().includes("james") ? <JamesAvatar className="mc-task-card-avatar" /> : <AgentAvatar name={task.assignee} />}</footer>
        </article>
      ))}
      {!loading && tasks.length === 0 && <div className="mc-task-empty">No items</div>}
    </div>
  </section>;
}

function CreateTaskModal({ projects, onClose, onCreated }: { projects: Project[]; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [project, setProject] = useState(projects[0]?.name || "Mission Control");
  const [busy, setBusy] = useState(false);
  const voice = useVoiceInput(text => setDescription(current => `${current}${current ? " " : ""}${text}`));
  async function submit() {
    if (!title.trim() || !description.trim()) return;
    setBusy(true);
    try {
      await jsonFetch("/api/orchestrator/intake", { method: "POST", body: JSON.stringify({ title, description, project, approvalRequired: false }) });
      onCreated();
    } finally { setBusy(false); }
  }
  return <Modal onClose={onClose} label="Add Task" className="mc-task-create-modal">
    <header className="mc-task-modal-header"><h2>Add Task</h2><p>Executable work goes directly to James for orchestration.</p></header>
    <div className="mc-task-form">
      <label className="mc-task-form-wide">Task Title<input value={title} onChange={e => setTitle(e.target.value)} autoFocus /></label>
      <label className="mc-task-form-wide">Description<div className="mc-v2-compose-row"><textarea rows={5} value={description} onChange={e => setDescription(e.target.value)} /><button type="button" className={voice.listening ? "active" : ""} onClick={voice.start}><Mic /></button></div></label>
      <label className="mc-task-form-wide">Project<select value={project} onChange={e => setProject(e.target.value)}><option>Mission Control</option>{projects.map(item => <option key={item.id}>{item.name}</option>)}</select></label>
    </div>
    <footer className="mc-task-modal-footer"><button className="mc-task-secondary-button" onClick={onClose}>Cancel</button><button className="mc-task-primary-button" disabled={busy || !title.trim() || !description.trim()} onClick={() => void submit()}>{busy ? "Adding…" : "Add Task"}</button></footer>
  </Modal>;
}

function CreateIdeaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const voice = useVoiceInput(text => setNotes(current => `${current}${current ? " " : ""}${text}`));
  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    try { await jsonFetch("/api/ideas", { method: "POST", body: JSON.stringify({ title, notes }) }); onCreated(); }
    finally { setBusy(false); }
  }
  return <Modal onClose={onClose} label="Add Idea" className="mc-task-create-modal">
    <header className="mc-task-modal-header"><h2>Add Idea / To-Do</h2><p>Notebook only. James will not execute this unless you explicitly convert it to a task.</p></header>
    <div className="mc-task-form">
      <label className="mc-task-form-wide">Title<input value={title} onChange={e => setTitle(e.target.value)} autoFocus /></label>
      <label className="mc-task-form-wide">Notes<div className="mc-v2-compose-row"><textarea rows={8} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Text dump, list, research thought, future to-do…" /><button type="button" className={voice.listening ? "active" : ""} onClick={voice.start}><Mic /></button></div></label>
    </div>
    <footer className="mc-task-modal-footer"><button className="mc-task-secondary-button" onClick={onClose}>Cancel</button><button className="mc-task-primary-button" disabled={busy || !title.trim()} onClick={() => void submit()}>{busy ? "Saving…" : "Save Idea"}</button></footer>
  </Modal>;
}

function AttachmentUploader({ endpoint, onUploaded }: { endpoint: string; onUploaded: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    try {
      const dataBase64 = await fileToBase64(file);
      await jsonFetch(endpoint, { method: "POST", body: JSON.stringify({ name: file.name, mimeType: file.type, dataBase64 }) });
      await onUploaded();
    } finally { setBusy(false); }
  }
  return <label className="mc-v2-upload-button"><FileUp /> {busy ? "Uploading…" : "Upload"}<input type="file" multiple disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); void (async () => { for (const file of files) await upload(file); event.target.value = ""; })(); }} /></label>;
}

function TaskDetailModal({ task, onClose, onChanged }: { task: Task; onClose: () => void; onChanged: () => Promise<void> }) {
  const [details, setDetails] = useState<TaskDetails | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const voice = useVoiceInput(text => setMessage(current => `${current}${current ? " " : ""}${text}`));
  async function load() { setDetails(await jsonFetch<TaskDetails>(`/api/tasks/${task.id}/details`)); }
  useEffect(() => { void load(); }, [task.id]);
  const value = details ?? ({ ...task, messages: [] } as TaskDetails);
  const timeline = useMemo(() => value.messages ?? [], [value.messages]);
  async function send() {
    if (!message.trim()) return;
    setBusy(true);
    try { await jsonFetch(`/api/tasks/${task.id}/messages`, { method: "POST", body: JSON.stringify({ body: message }) }); setMessage(""); await load(); await onChanged(); }
    finally { setBusy(false); }
  }
  async function archive() {
    setBusy(true);
    try { await jsonFetch(`/api/tasks/${task.id}/archive`, { method: "POST", body: "{}" }); await onChanged(); onClose(); }
    finally { setBusy(false); }
  }
  return <Modal onClose={onClose} label={value.title} className="mc-task-detail-modal mc-v2-detail-modal">
    <header className="mc-task-modal-header"><span className="mc-task-modal-kicker">{value.status.replaceAll("_", " ")}</span><h2>{value.title}</h2></header>
    <div className="mc-v2-detail-grid">
      <main>
        <p className="mc-task-detail-description">{value.description}</p>
        <dl className="mc-task-detail-meta"><div><dt>Orchestrator</dt><dd>{value.assignee}</dd></div><div><dt>Project</dt><dd>{value.project}</dd></div></dl>
        <section className="mc-task-detail-section"><div className="mc-v2-section-head"><h3>Attachments</h3><AttachmentUploader endpoint={`/api/tasks/${task.id}/attachments`} onUploaded={async () => { await load(); await onChanged(); }} /></div><AttachmentList attachments={value.attachments ?? []} /></section>
        {value.status === "done" && <section className="mc-v2-final"><Check /><div><strong>James has marked this task complete.</strong><p>Review the final evidence and archive only when you accept the success milestone.</p></div></section>}
        {value.approvalRequired && <section className="mc-v2-blocker"><strong>Owner action required</strong><p>James has identified a genuine owner-level decision. Review the task timeline for the exact decision required.</p></section>}
      </main>
      <aside className="mc-task-conversation mc-v2-timeline"><header><JamesAvatar className="mc-task-conversation-avatar" /><div><h3>Task Timeline & Notes</h3><span>Worker activity, James review and owner notes</span></div></header><div className="mc-task-conversation-messages">{timeline.map(item => <article key={item.id} className="mc-v2-message"><div><strong>{item.author}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div><p>{item.body}</p></article>)}</div><div className="mc-task-conversation-compose mc-v2-compose"><textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="Add a note for James" /><button className={voice.listening ? "active" : ""} onClick={voice.start}><Mic /></button><button onClick={() => void send()} disabled={busy || !message.trim()}><Send /></button></div></aside>
    </div>
    <footer className="mc-task-modal-footer">{value.status === "done" ? <button className="mc-task-primary-button" disabled={busy} onClick={() => void archive()}><Archive /> Archive — Final Acceptance</button> : <span className="mc-v2-footer-note">No routine owner approval required. James manages execution and review.</span>}</footer>
  </Modal>;
}

function IdeaDetailModal({ idea, projects, onClose, onChanged }: { idea: Idea; projects: Project[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [title, setTitle] = useState(idea.title);
  const [notes, setNotes] = useState(idea.notes);
  const [project, setProject] = useState(projects[0]?.name || "Mission Control");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(idea);
  const voice = useVoiceInput(text => setNotes(value => `${value}${value ? " " : ""}${text}`));
  async function reload() { const all = await jsonFetch<Idea[]>("/api/ideas"); const next = all.find(item => item.id === idea.id); if (next) setCurrent(next); }
  async function save() { setBusy(true); try { const updated = await jsonFetch<Idea>(`/api/ideas/${idea.id}`, { method: "PATCH", body: JSON.stringify({ title, notes }) }); setCurrent(updated); } finally { setBusy(false); } }
  async function remove() { if (!window.confirm("Delete this idea?")) return; setBusy(true); try { await fetch(`/api/ideas/${idea.id}`, { method: "DELETE", headers: authHeaders() }); await onChanged(); } finally { setBusy(false); } }
  async function makeTask() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await jsonFetch("/api/orchestrator/intake", { method: "POST", body: JSON.stringify({ title, description: notes || title, project, approvalRequired: false, attachments: current.attachments ?? [] }) });
      await fetch(`/api/ideas/${idea.id}`, { method: "DELETE", headers: authHeaders() });
      await onChanged();
    } finally { setBusy(false); }
  }
  return <Modal onClose={onClose} label={title} className="mc-task-detail-modal mc-v2-idea-modal">
    <header className="mc-task-modal-header"><span className="mc-task-modal-kicker">Idea / To-Do — not allocated</span><h2>{title}</h2></header>
    <div className="mc-v2-idea-editor"><label>Title<input value={title} onChange={e => setTitle(e.target.value)} /></label><label>Notes<div className="mc-v2-compose-row"><textarea rows={12} value={notes} onChange={e => setNotes(e.target.value)} /><button className={voice.listening ? "active" : ""} onClick={voice.start}><Mic /></button></div></label><div className="mc-v2-section-head"><h3>Attachments</h3><AttachmentUploader endpoint={`/api/ideas/${idea.id}/attachments`} onUploaded={reload} /></div><AttachmentList attachments={current.attachments ?? []} /><p className="mc-v2-idea-rule">James does not execute this note. Mentioning James is discussion only until you explicitly make it a task.</p><label>Task project<select value={project} onChange={e => setProject(e.target.value)}><option>Mission Control</option>{projects.map(item => <option key={item.id}>{item.name}</option>)}</select></label></div>
    <footer className="mc-task-modal-footer mc-v2-idea-actions"><button className="mc-task-secondary-button mc-v2-delete" disabled={busy} onClick={() => void remove()}><Trash2 /> Delete</button><button className="mc-task-secondary-button" disabled={busy} onClick={() => void save()}>Save Notes</button><button className="mc-task-primary-button" disabled={busy} onClick={() => void makeTask()}><Plus /> Make Task</button></footer>
  </Modal>;
}

function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (!attachments.length) return <p className="mc-v2-no-attachments">No attachments yet.</p>;
  return <div className="mc-task-attachment-list">{attachments.map((attachment, index) => attachment.url ? <a key={`${attachment.name}-${index}`} href={attachment.url} target="_blank" rel="noreferrer"><Paperclip /> {attachment.name}</a> : <span key={`${attachment.name}-${index}`}><Paperclip /> {attachment.name}</span>)}</div>;
}
