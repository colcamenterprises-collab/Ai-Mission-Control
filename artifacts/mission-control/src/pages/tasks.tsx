import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListEvents, useListTasks, useMoveTask, getListTasksQueryKey, type CalendarEvent, type Task } from "@workspace/api-client-react";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, MessageCircle, Paperclip, Plus, Send } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AgentAvatar, agentTone } from "@/components/agent-avatar";
import { JamesAvatar } from "@/components/james-avatar";
import "./workspaces.css";
import "./tasks-simple.css";
import "./tasks-reference.css";

type TaskMeta = Task & { recurrence?: string; approvalRequired?: boolean; unreadMessages?: number; attachments?: Array<{name:string;url?:string}>; report?: string; archivedAt?: string | null };
type TaskMessage = { id:number; author:string; body:string; createdAt:string };
type TaskDetails = TaskMeta & { messages: TaskMessage[] };
type Project = { id:number; name:string };

const COLUMNS = [
  { id: "todo", label: "To-Do", matches: ["backlog", "ready"] },
  { id: "doing", label: "Doing", matches: ["running", "in_progress", "review", "blocked"] },
  { id: "done", label: "Done", matches: ["done"] },
] as const;

function authHeaders() {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}) };
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const { data: rawTasks = [], isLoading } = useListTasks();
  const { data: calendarEvents = [] } = useListEvents();
  const tasks = rawTasks as TaskMeta[];
  const moveTask = useMoveTask();
  const [selectedTask, setSelectedTask] = useState<TaskMeta | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  useEffect(() => { fetch("/api/projects", { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then(setProjects).catch(() => setProjects([])); }, []);
  const approvalCount = tasks.filter(task => ["review", "blocked"].includes(task.status) || task.approvalRequired && ["running", "in_progress"].includes(task.status)).length;

  return <div className="workspaces-shell task-page-shell">
    <div className="workspaces-canvas tasks-canvas-simple">
      <header className="task-page-header">
        <h1>Task</h1>
        <div className="task-header-actions">
          {approvalCount > 0 && <button className="approval-alert" onClick={() => setSelectedTask(tasks.find(t => ["review","blocked"].includes(t.status)) ?? null)}><AlertTriangle />{approvalCount} approval{approvalCount === 1 ? "" : "s"} needed</button>}
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add task</Button>
        </div>
      </header>

      <section className="task-board-grid" aria-label="Task Kanban board and automation calendar">
        {isLoading ? COLUMNS.map(c => <div className="task-lane" key={c.id}><Skeleton className="h-8 w-full" /><Skeleton className="mt-3 h-32 w-full" /></div>) : COLUMNS.map(column => {
          const laneTasks = tasks.filter(task => column.matches.includes(task.status as never));
          return <div className="task-lane" key={column.id}>
            <div className="task-lane-head"><strong>{column.label}</strong><span>{laneTasks.length}</span></div>
            <div className="task-lane-list">
              {laneTasks.map(task => <TaskCard key={task.id} task={task} onOpen={() => setSelectedTask(task)} />)}
              {!laneTasks.length && <div className="task-lane-empty">No tasks</div>}
            </div>
            <button className="task-lane-add" onClick={() => setCreateOpen(true)}><Plus /> Add task</button>
          </div>;
        })}
        <AutomationCalendar tasks={tasks} events={calendarEvents} />
      </section>
    </div>
    <CreateTaskDialog open={createOpen} projects={projects} onClose={() => setCreateOpen(false)} onCreated={async project => { setCreateOpen(false); if (project && !projects.some(p => p.name === project)) setProjects(v => [...v, { id: Date.now(), name: project }]); await invalidate(); }} />
    <TaskDetailDialog task={selectedTask} onClose={() => setSelectedTask(null)} onMove={(task,status) => moveTask.mutate({ id: task.id, data: { status: status as Task["status"] } }, { onSuccess: async () => { await invalidate(); setSelectedTask(null); } })} />
  </div>;
}

function TaskCard({ task, onOpen }: { task: TaskMeta; onOpen: () => void }) {
  const approval = ["review", "blocked"].includes(task.status) || Boolean(task.approvalRequired && ["running", "in_progress"].includes(task.status));
  return <article className={`task-card-minimal task-agent-${agentTone(task.assignee)} ${approval ? "needs-approval" : ""}`} onClick={onOpen}>
    {approval && <span className="card-approval"><AlertTriangle /> Approval required</span>}
    <h3>{task.title}</h3>
    <p>{task.description || "No description provided."}</p>
    {task.dueDate && <span className="task-due"><CalendarDays />{new Date(task.dueDate).toLocaleString([], { dateStyle:"medium", timeStyle:"short" })}</span>}
    <footer>
      <div className="task-card-icons"><span><MessageCircle />{task.unreadMessages ?? 0}</span>{Boolean(task.attachments?.length) && <span><Paperclip />{task.attachments!.length}</span>}</div>
      {task.assignee?.toLowerCase().includes("james") ? <JamesAvatar className="mission-agent-avatar task-james-avatar" /> : <AgentAvatar name={task.assignee} />}
    </footer>
  </article>;
}

function CreateTaskDialog({ open, projects, onClose, onCreated }: { open:boolean; projects:Project[]; onClose:()=>void; onCreated:(project:string)=>void }) {
  const [form,setForm] = useState({ title:"",description:"",date:"",time:"",recurrence:"one_off",project:"Mission Control",newProject:"",approvalRequired:false });
  const [files,setFiles] = useState<string[]>([]); const [busy,setBusy] = useState(false); const [error,setError] = useState("");
  const project = form.project === "__new" ? form.newProject.trim() : form.project;
  const submit = async () => { setError(""); if (!form.title.trim() || !form.description.trim() || !project) { setError("Title, description and project are required."); return; } setBusy(true);
    try {
      if (form.project === "__new") { const pr = await fetch("/api/projects", { method:"POST", headers:authHeaders(), body:JSON.stringify({name:project}) }); if (!pr.ok && pr.status !== 409) throw new Error("Unable to create project"); }
      const dueDate = form.date ? new Date(`${form.date}T${form.time || "17:00"}`).toISOString() : null;
      const response = await fetch("/api/orchestrator/intake", { method:"POST", headers:authHeaders(), body:JSON.stringify({ title:form.title, description:form.description, project, dueDate, recurrence:form.recurrence, approvalRequired:form.approvalRequired, attachments:files.map(name => ({name})) }) });
      if (!response.ok) throw new Error((await response.json()).error || "Unable to create task");
      setForm({ title:"",description:"",date:"",time:"",recurrence:"one_off",project:"Mission Control",newProject:"",approvalRequired:false }); setFiles([]); onCreated(project);
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to create task"); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={v => !v && onClose()}><DialogContent className="task-create-dialog"><DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
    <div className="task-form"><label>Title<Input value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))} /></label><label>Description<Textarea rows={4} value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} /></label>
      <div className="task-form-row"><label>Due date<Input type="date" value={form.date} onChange={e=>setForm(v=>({...v,date:e.target.value}))} /></label><label>Due time<Input type="time" value={form.time} onChange={e=>setForm(v=>({...v,time:e.target.value}))} /></label></div>
      <div className="task-form-row"><label>Schedule<select value={form.recurrence} onChange={e=>setForm(v=>({...v,recurrence:e.target.value}))}><option value="one_off">One off</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label>Project<select value={form.project} onChange={e=>setForm(v=>({...v,project:e.target.value}))}><option>Mission Control</option>{projects.map(p=><option key={p.id}>{p.name}</option>)}<option value="__new">+ Create project</option></select></label></div>
      {form.project === "__new" && <label>New project name<Input value={form.newProject} onChange={e=>setForm(v=>({...v,newProject:e.target.value}))} /></label>}
      <label className="task-check"><input type="checkbox" checked={form.approvalRequired} onChange={e=>setForm(v=>({...v,approvalRequired:e.target.checked}))} /> This task requires owner approval</label>
      <label>Attachments<Input type="file" multiple onChange={e=>setFiles(Array.from(e.target.files ?? []).map(f=>f.name))} /></label>{files.length > 0 && <small>{files.join(", ")}</small>}{error && <p className="task-error">{error}</p>}
      <Button onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add Task"}</Button>
    </div></DialogContent></Dialog>;
}

type AutomationItem = { id: string; title: string; description: string; date: Date; schedule: string };

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function AutomationCalendar({ tasks, events }: { tasks: TaskMeta[]; events: CalendarEvent[] }) {
  const [view, setView] = useState<"week" | "month">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<{ date: Date; items: AutomationItem[] } | null>(null);
  const today = new Date();
  const visibleDays = useMemo(() => {
    if (view === "week") {
      const start = new Date(cursor); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay());
      return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  }, [cursor, view]);
  const itemsByDay = useMemo(() => {
    const result = new Map<string, AutomationItem[]>();
    const add = (item: AutomationItem) => result.set(dateKey(item.date), [...(result.get(dateKey(item.date)) ?? []), item]);
    const automationEvents = events.filter(event => event.category === "automation");
    for (const day of visibleDays) {
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      automationEvents.forEach(event => {
        const start = new Date(event.startDate); const end = event.endDate ? new Date(event.endDate) : start;
        if (start <= dayEnd && end >= dayStart) add({ id:`event-${event.id}`, title:event.title, description:event.description ?? "Automation event", date:day, schedule:start.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) });
      });
      tasks.filter(task => task.recurrence && task.recurrence !== "one_off" && task.dueDate).forEach(task => {
        const due = new Date(task.dueDate!);
        const active = task.recurrence === "daily" || task.recurrence === "weekly" && due.getDay() === day.getDay() || task.recurrence === "monthly" && due.getDate() === day.getDate();
        if (active && dayStart >= new Date(due.getFullYear(), due.getMonth(), due.getDate())) add({ id:`task-${task.id}`, title:task.title, description:task.description ?? "Recurring task", date:day, schedule:`${task.recurrence} · ${due.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` });
      });
    }
    return result;
  }, [events, tasks, visibleDays]);
  const navigate = (direction: number) => setCursor(value => { const next = new Date(value); if (view === "month") next.setMonth(next.getMonth() + direction); else next.setDate(next.getDate() + 7 * direction); return next; });
  const label = view === "month" ? cursor.toLocaleDateString([], { month:"long", year:"numeric" }) : `${visibleDays[0].toLocaleDateString([], {month:"short",day:"numeric"})} – ${visibleDays[6].toLocaleDateString([], {month:"short",day:"numeric"})}`;
  return <div className="automation-calendar task-lane">
    <div className="automation-calendar-title"><strong>Calendar</strong><div><button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Monthly</button><button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Weekly</button></div></div>
    <div className="automation-calendar-nav"><button onClick={() => navigate(-1)} aria-label="Previous"><ChevronLeft /></button><span>{label}</span><button onClick={() => navigate(1)} aria-label="Next"><ChevronRight /></button></div>
    <div className={`automation-calendar-grid ${view}`}>{["S","M","T","W","T","F","S"].map((day,index) => <span className="automation-weekday" key={`${day}-${index}`}>{day}</span>)}{visibleDays.map(day => { const items = itemsByDay.get(dateKey(day)) ?? []; const active = items.length > 0; const outside = view === "month" && day.getMonth() !== cursor.getMonth(); const isToday = dateKey(day) === dateKey(today); return <button key={dateKey(day)} className={`${active ? "has-automation" : ""} ${outside ? "outside" : ""} ${isToday ? "today" : ""}`} onClick={() => active && setSelected({date:day,items})} disabled={!active}><span>{day.getDate()}</span>{active && <small>{items.length}</small>}</button>; })}</div>
    <div className="automation-calendar-key"><span /> Active automation</div>
    <Dialog open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}><DialogContent className="automation-detail-dialog"><DialogHeader><DialogTitle>{selected?.date.toLocaleDateString([], {weekday:"long",month:"long",day:"numeric"})}</DialogTitle></DialogHeader><div className="automation-detail-list">{selected?.items.map(item => <article key={item.id}><div><span>{item.schedule}</span><h3>{item.title}</h3></div><p>{item.description}</p></article>)}</div></DialogContent></Dialog>
  </div>;
}

function TaskDetailDialog({ task, onClose, onMove }: { task:TaskMeta|null; onClose:()=>void; onMove:(task:TaskMeta,status:string)=>void }) {
  const [details,setDetails]=useState<TaskDetails|null>(null); const [message,setMessage]=useState(""); const [sending,setSending]=useState(false);
  useEffect(()=>{ setDetails(null); if(task) fetch(`/api/tasks/${task.id}/details`,{headers:authHeaders()}).then(r=>r.json()).then(setDetails).catch(()=>setDetails({...task,messages:[]})); },[task]);
  const send=async()=>{ if(!task||!message.trim())return; setSending(true); const r=await fetch(`/api/tasks/${task.id}/messages`,{method:"POST",headers:authHeaders(),body:JSON.stringify({body:message})}); if(r.ok){const created=await r.json();setDetails(v=>v?{...v,messages:[...v.messages,created]}:v);setMessage("");}setSending(false); };
  if(!task)return null; const value=details??({...task,messages:[]} as TaskDetails); const doing=["running","in_progress","review","blocked"].includes(value.status);
  return <Dialog open onOpenChange={v=>!v&&onClose()}><DialogContent className="task-detail-dialog"><DialogHeader><DialogTitle>{value.title}</DialogTitle></DialogHeader>
    <div className="task-detail-layout"><main><p className="detail-description">{value.description}</p><div className="task-detail-grid"><div><span>Status</span><strong>{COLUMNS.find(c=>c.matches.includes(value.status as never))?.label}</strong></div><div><span>Agent</span><strong>{value.assignee}</strong></div><div><span>Project</span><strong>{value.project}</strong></div><div><span>Due</span><strong>{value.dueDate?new Date(value.dueDate).toLocaleString():"Not set"}</strong></div><div><span>Schedule</span><strong>{value.recurrence?.replace("_"," ")||"One off"}</strong></div><div><span>Attachments</span><strong>{value.attachments?.length??0}</strong></div></div>
      <section className="task-report"><h3>Agent report</h3><p>{value.report || (doing ? "The orchestrator is collecting progress and agent reports for this task." : value.status === "done" ? "Task completed and archived with its project record." : "No report has been submitted yet.")}</p></section>
      {value.attachments?.length ? <section className="task-attachments"><h3>Attachments</h3>{value.attachments.map((a,i)=><span key={i}><Paperclip />{a.name}</span>)}</section>:null}</main>
      <aside><h3>Task conversation</h3><p className="orchestrator-note">Messages go to the orchestrator. Assigned agents report through the orchestrator—not directly to the owner.</p><div className="task-messages">{value.messages.length?value.messages.map(m=><div key={m.id}><strong>{m.author}</strong><p>{m.body}</p><time>{new Date(m.createdAt).toLocaleString()}</time></div>):<span>No messages yet.</span>}</div><div className="message-compose"><Textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Message the orchestrator…"/><Button onClick={send} disabled={sending||!message.trim()}><Send /></Button></div></aside></div>
    <footer className="task-detail-actions">{value.status === "done" ? <span><CheckCircle2 /> Archived in {value.project}</span> : <><Button variant="outline" onClick={()=>onMove(value,"running")}>Move to Doing</Button><Button onClick={()=>onMove(value,"done")}>Mark Done & Archive</Button></>}</footer>
  </DialogContent></Dialog>;
}
