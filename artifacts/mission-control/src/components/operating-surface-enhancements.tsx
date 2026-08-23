import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getListTasksQueryKey } from "@workspace/api-client-react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FolderPlus, X } from "lucide-react";
import "./operating-surface-enhancements.css";

type TaskItem = {
  id: number;
  title: string;
  status: string;
  assignee?: string | null;
  dueDate?: string | null;
  recurrence?: string | null;
  updatedAt?: string;
  approvalRequired?: boolean | null;
};

function authHeaders(contentType = false) {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return {
    Accept: "application/json",
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
  };
}

function laneForStatus(status: string) {
  if (status === "review" || status === "done") return "Done";
  if (status === "changes_required" || status === "blocked") return "Changes Required";
  return "Doing";
}

const AGENT_PALETTE = [
  ["#b8a6ff", "#30284f", "#7b62e8"],
  ["#7de1f4", "#18333d", "#45b1c7"],
  ["#8db4ff", "#1e3454", "#5e88df"],
  ["#8ee6b4", "#1d3828", "#4bae77"],
  ["#ffa5d1", "#452538", "#cc6697"],
  ["#ffd082", "#46331b", "#d19a3f"],
];

function paletteForAgent(agent?: string | null) {
  const input = agent?.trim() || "Unassigned";
  let hash = 0;
  for (const char of input) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}

export function OperatingSurfaceEnhancements() {
  const queryClient = useQueryClient();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskWorkspaceNode, setTaskWorkspaceNode] = useState<HTMLElement | null>(null);
  const [dashboardNode, setDashboardNode] = useState<HTMLElement | null>(null);
  const [dashboardActionsNode, setDashboardActionsNode] = useState<HTMLElement | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [projectCreated, setProjectCreated] = useState("");

  const loadTasks = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks", { headers: authHeaders() });
      if (!response.ok) return;
      setTasks(await response.json() as TaskItem[]);
    } catch {
      // Native task page remains authoritative if an enhancement refresh fails.
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    await loadTasks();
    await queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
  }, [loadTasks, queryClient]);

  useEffect(() => {
    void loadTasks();
    const timer = window.setInterval(() => void loadTasks(), 5000);
    return () => window.clearInterval(timer);
  }, [loadTasks]);

  useEffect(() => {
    const syncNodes = () => {
      setTaskWorkspaceNode(document.querySelector<HTMLElement>(".mc-task-workspace"));
      setDashboardNode(document.querySelector<HTMLElement>(".mission-briefing-panel"));
      setDashboardActionsNode(document.querySelector<HTMLElement>(".mission-capture-actions"));
      for (const heading of Array.from(document.querySelectorAll<HTMLElement>("h2"))) {
        if (heading.textContent?.includes("Cron Job Manager")) {
          const section = heading.closest<HTMLElement>("section");
          if (section) section.style.display = "none";
        }
      }
      for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/tasks?create=note"]'))) {
        anchor.href = anchor.href.replace("/tasks?create=note", "/notes?create=note");
      }
    };
    syncNodes();
    const observer = new MutationObserver(syncNodes);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const performAction = async (task: TaskItem, action: "approve" | "accept" | "changes") => {
      let endpoint = `/api/tasks/${task.id}/approve`;
      let body: { note?: string } = { note: "Approved directly from the Kanban card." };
      if (action === "accept") {
        endpoint = `/api/tasks/${task.id}/accept`;
        body = { note: "Accepted directly from the Kanban card." };
      } else if (action === "changes") {
        const note = window.prompt("What needs to change?")?.trim();
        if (!note) return;
        endpoint = `/api/tasks/${task.id}/request-changes`;
        body = { note };
      }

      const response = await fetch(endpoint, { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        window.alert(payload.error || `Unable to ${action} Task #${task.id}.`);
        return;
      }

      if (action === "accept") {
        const archiveResponse = await fetch(`/api/tasks/${task.id}/archive`, {
          method: "POST",
          headers: authHeaders(true),
          body: "{}",
        });
        if (!archiveResponse.ok) {
          const payload = await archiveResponse.json().catch(() => ({})) as { error?: string };
          window.alert(payload.error || `Task #${task.id} was accepted but could not be archived.`);
          await refreshTasks();
          return;
        }
      } else if (action === "changes") {
        const moveResponse = await fetch(`/api/tasks/${task.id}/move`, {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ status: "changes_required" }),
        });
        if (!moveResponse.ok) {
          const payload = await moveResponse.json().catch(() => ({})) as { error?: string };
          window.alert(payload.error || `Change request was recorded but Task #${task.id} could not be moved to Changes Required.`);
        }
      }

      await refreshTasks();
    };

    const decorate = () => {
      const used = new Set<number>();
      for (const card of Array.from(document.querySelectorAll<HTMLElement>(".mc-task-card"))) {
        if (card.closest(".mc-inbox-lane")) continue;
        const title = card.querySelector("h3")?.textContent?.trim() ?? "";
        const lane = card.closest(".mc-task-lane")?.querySelector(".mc-task-lane-header h2")?.textContent?.trim() ?? "";
        const candidates = tasks.filter((task) => task.title === title && laneForStatus(task.status) === lane && !used.has(task.id));
        const fallback = tasks.filter((task) => task.title === title && !used.has(task.id));
        const task = candidates[0] ?? fallback[0];
        if (!task) continue;
        used.add(task.id);
        const [text, background, border] = paletteForAgent(task.assignee);
        card.style.setProperty("--mc-agent-text", text);
        card.style.setProperty("--mc-agent-bg", background);
        card.style.setProperty("--mc-agent-border", border);
        card.dataset.agent = task.assignee?.trim() || "Unassigned";
        card.dataset.taskId = String(task.id);
        if (!card.querySelector(".mc-agent-label")) {
          const label = document.createElement("span");
          label.className = "mc-agent-label";
          label.textContent = task.assignee?.trim() || "Unassigned";
          const footer = card.querySelector("footer");
          if (footer) footer.prepend(label);
        }
        if (!card.querySelector(".mc-card-inline-actions") && (task.approvalRequired || task.status === "review")) {
          const actions = document.createElement("div");
          actions.className = "mc-card-inline-actions";
          if (task.approvalRequired) {
            const approve = document.createElement("button");
            approve.type = "button";
            approve.innerHTML = "✓ Approve";
            approve.className = "mc-card-action-primary";
            approve.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void performAction(task, "approve"); });
            actions.appendChild(approve);
          }
          if (task.status === "review") {
            const changes = document.createElement("button");
            changes.type = "button";
            changes.textContent = "Changes";
            changes.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void performAction(task, "changes"); });
            const accept = document.createElement("button");
            accept.type = "button";
            accept.className = "mc-card-action-primary";
            accept.innerHTML = "✓ Accept";
            accept.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void performAction(task, "accept"); });
            actions.append(changes, accept);
          }
          card.appendChild(actions);
        }
      }
    };
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [tasks, refreshTasks]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const workspace = (event.target as HTMLElement | null)?.closest<HTMLElement>(".mc-task-workspace");
      if (!workspace || workspace.scrollWidth <= workspace.clientWidth) return;
      const verticalLane = (event.target as HTMLElement | null)?.closest<HTMLElement>(".mc-task-lane-scroll");
      if (verticalLane && Math.abs(event.deltaY) > Math.abs(event.deltaX) && verticalLane.scrollHeight > verticalLane.clientHeight && !event.shiftKey) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      workspace.scrollLeft += delta;
      event.preventDefault();
    };
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, true);
  }, []);

  useEffect(() => {
    let ghost: HTMLElement | null = null;
    const move = (event: PointerEvent) => {
      const dragging = document.querySelector<HTMLElement>(".mc-task-card-dragging");
      if (!dragging) { ghost?.remove(); ghost = null; return; }
      if (!ghost) {
        ghost = dragging.cloneNode(true) as HTMLElement;
        ghost.classList.add("mc-task-drag-ghost");
        ghost.classList.remove("mc-task-card-dragging");
        const rect = dragging.getBoundingClientRect();
        ghost.style.width = `${rect.width}px`;
        document.body.appendChild(ghost);
      }
      ghost.style.left = `${Math.min(event.clientX + 14, window.innerWidth - ghost.offsetWidth - 8)}px`;
      ghost.style.top = `${Math.min(event.clientY + 14, window.innerHeight - ghost.offsetHeight - 8)}px`;
    };
    const clear = () => { ghost?.remove(); ghost = null; };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", clear, true);
    document.addEventListener("pointercancel", clear, true);
    return () => { clear(); document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", clear, true); document.removeEventListener("pointercancel", clear, true); };
  }, []);

  async function saveProject() {
    const name = projectName.trim();
    if (!name) { setProjectError("Project name is required."); return; }
    setProjectSaving(true);
    setProjectError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ name, description: projectDescription.trim() || null }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `Unable to create project (HTTP ${response.status})`);
      }
      setProjectOpen(false);
      setProjectName("");
      setProjectDescription("");
      setProjectCreated(`Project created: ${name}`);
      window.setTimeout(() => setProjectCreated(""), 3500);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Unable to create project");
    } finally {
      setProjectSaving(false);
    }
  }

  return <>
    {taskWorkspaceNode && createPortal(<AutomationCalendar tasks={tasks} context="tasks" />, taskWorkspaceNode)}
    {dashboardNode && createPortal(<AutomationCalendar tasks={tasks} context="dashboard" />, dashboardNode)}
    {dashboardActionsNode && createPortal(<button type="button" className="mission-project-quick-action" onClick={() => { setProjectError(""); setProjectOpen(true); }}><FolderPlus /> + Project</button>, dashboardActionsNode)}
    {projectOpen && createPortal(<div className="mc-project-modal-backdrop" onMouseDown={() => setProjectOpen(false)}><section className="mc-project-modal" role="dialog" aria-modal="true" aria-label="Add project" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Business workspace</span><h2>Add project</h2></div><button type="button" aria-label="Close" onClick={() => setProjectOpen(false)}><X /></button></header><label>Project name<input autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" /></label><label>Description <small>optional</small><textarea rows={5} value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="What is this project responsible for?" /></label>{projectError && <p className="mc-project-error">{projectError}</p>}<footer><button type="button" onClick={() => setProjectOpen(false)}>Cancel</button><button type="button" className="mc-project-save" disabled={projectSaving} onClick={() => void saveProject()}>{projectSaving ? "Creating…" : "Create project"}</button></footer></section></div>, document.body)}
    {projectCreated && createPortal(<div className="mc-project-toast" role="status">{projectCreated}</div>, document.body)}
  </>;
}

function AutomationCalendar({ tasks, context }: { tasks: TaskItem[]; context: "tasks" | "dashboard" }) {
  const [cursor, setCursor] = useState(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const today = new Date();
  const scheduled = useMemo(() => tasks.filter((task) => Boolean(task.dueDate) || Boolean(task.recurrence && task.recurrence !== "one_off")), [tasks]);
  const dueKeys = useMemo(() => new Set(scheduled.flatMap((task) => task.dueDate ? [dayKey(new Date(task.dueDate))] : [])), [scheduled]);
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first); start.setDate(first.getDate() - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  const upcoming = [...scheduled].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  }).slice(0, context === "dashboard" ? 2 : 1);
  const selectedTasks = selectedDate ? scheduled.filter((task) => task.dueDate && dayKey(new Date(task.dueDate)) === dayKey(selectedDate)) : [];
  const recurringTasks = selectedDate ? scheduled.filter((task) => !task.dueDate && Boolean(task.recurrence && task.recurrence !== "one_off")) : [];

  function openDate(date: Date) {
    const selected = new Date(date);
    setCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setSelectedDate(selected);
  }

  function shiftSelected(days: number) {
    if (!selectedDate) return;
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + days);
    openDate(next);
  }

  return <>
    <section className={`operating-calendar operating-calendar-${context}`}>
      <header><div><span><CalendarDays /> Automations</span><h2>{cursor.toLocaleDateString([], { month: "long", year: "numeric" })}</h2></div><div className="operating-calendar-nav"><button type="button" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft /></button><button type="button" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight /></button></div></header>
      <div className="operating-calendar-weekdays">{["S","M","T","W","T","F","S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="operating-calendar-grid">{days.map((date) => { const key = dayKey(date); const currentMonth = date.getMonth() === cursor.getMonth(); const isToday = key === dayKey(today); const active = dueKeys.has(key); return <button type="button" aria-label={`Open ${date.toLocaleDateString()}`} key={key} onClick={() => setSelectedDate(date)} className={`operating-calendar-day ${currentMonth ? "" : "outside"} ${isToday ? "today" : ""} ${active ? "active" : ""}`}><span>{date.getDate()}</span>{active && <i />}</button>; })}</div>
      <footer>{upcoming.length ? upcoming.map((task) => <div className="operating-calendar-item" key={task.id}><Clock3 /><div><strong>{task.title}</strong><span>{task.dueDate ? new Date(task.dueDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : `Recurring · ${task.recurrence}`}</span></div></div>) : <p>No scheduled work.</p>}<button className="operating-calendar-open" type="button" onClick={() => openDate(today)}>Open calendar</button></footer>
    </section>
    {selectedDate && createPortal(<div className="operating-calendar-modal-backdrop" onMouseDown={() => setSelectedDate(null)}><section className="operating-calendar-modal" role="dialog" aria-modal="true" aria-label={`Schedule for ${selectedDate.toLocaleDateString()}`} onMouseDown={(event) => event.stopPropagation()}><header><div><span>Automation schedule</span><h2>{selectedDate.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2></div><button type="button" aria-label="Close calendar" onClick={() => setSelectedDate(null)}><X /></button></header><div className="operating-calendar-modal-nav"><button type="button" onClick={() => shiftSelected(-1)}><ChevronLeft /> Previous</button><button type="button" onClick={() => openDate(today)}>Today</button><button type="button" onClick={() => shiftSelected(1)}>Next <ChevronRight /></button></div><div className="operating-calendar-modal-list"><h3>Scheduled for this date</h3>{selectedTasks.length ? selectedTasks.map((task) => <article key={task.id}><Clock3 /><div><strong>{task.title}</strong><span>{task.assignee || "Unassigned"} · {task.dueDate ? new Date(task.dueDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Scheduled"}</span></div></article>) : <p>No dated work is scheduled for this date.</p>}{recurringTasks.length > 0 && <><h3>Recurring automations</h3>{recurringTasks.map((task) => <article key={`recurring-${task.id}`}><CalendarDays /><div><strong>{task.title}</strong><span>{task.assignee || "Unassigned"} · {task.recurrence}</span></div></article>)}</>}</div><footer><a href="/tasks">Open workboard</a><button type="button" onClick={() => setSelectedDate(null)}>Close</button></footer></section></div>, document.body)}
  </>;
}

function dayKey(date: Date) {
  if (Number.isNaN(date.getTime())) return "invalid";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
