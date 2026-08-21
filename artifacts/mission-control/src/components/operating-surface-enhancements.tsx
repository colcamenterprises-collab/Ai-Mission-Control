import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import "./operating-surface-enhancements.css";

type TaskItem = {
  id: number;
  title: string;
  status: string;
  assignee?: string | null;
  dueDate?: string | null;
  recurrence?: string | null;
  updatedAt?: string;
};

function authHeaders() {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}) };
}

function laneForStatus(status: string) {
  if (status === "review") return "Review";
  if (status === "done") return "Done";
  return "Doing";
}

const AGENT_PALETTE = [
  ["#a98bff", "#342a58", "#7258d8"],
  ["#72d9ef", "#1e3942", "#3ca2b9"],
  ["#7da8ff", "#223653", "#4f78d1"],
  ["#80e0aa", "#213b2d", "#42a36d"],
  ["#ff98c8", "#49293a", "#c55c8e"],
  ["#ffc86e", "#4a361e", "#c78e36"],
];

function paletteForAgent(agent?: string | null) {
  const input = agent?.trim() || "Unassigned";
  let hash = 0;
  for (const char of input) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}

export function OperatingSurfaceEnhancements() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskPageNode, setTaskPageNode] = useState<HTMLElement | null>(null);
  const [dashboardNode, setDashboardNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/tasks", { headers: authHeaders() });
        if (!response.ok) return;
        const next = await response.json() as TaskItem[];
        if (!cancelled) setTasks(next);
      } catch { /* native task page remains authoritative */ }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const syncNodes = () => {
      setTaskPageNode(document.querySelector<HTMLElement>(".mc-task-page"));
      setDashboardNode(document.querySelector<HTMLElement>(".mission-operations-home"));
      for (const heading of Array.from(document.querySelectorAll<HTMLElement>("h2"))) {
        if (heading.textContent?.includes("Cron Job Manager")) {
          const section = heading.closest<HTMLElement>("section");
          if (section) section.style.display = "none";
        }
      }
    };
    syncNodes();
    const observer = new MutationObserver(syncNodes);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
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
      }
    };
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [tasks]);

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

  return <>
    {taskPageNode && createPortal(<AutomationCalendar tasks={tasks} context="tasks" />, taskPageNode)}
    {dashboardNode && createPortal(<AutomationCalendar tasks={tasks} context="dashboard" />, dashboardNode)}
  </>;
}

function AutomationCalendar({ tasks, context }: { tasks: TaskItem[]; context: "tasks" | "dashboard" }) {
  const [cursor, setCursor] = useState(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1); });
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
  }).slice(0, context === "dashboard" ? 3 : 5);

  return <section className={`operating-calendar operating-calendar-${context}`}>
    <header><div><span><CalendarDays /> Automation calendar</span><h2>{cursor.toLocaleDateString([], { month: "long", year: "numeric" })}</h2></div><div className="operating-calendar-nav"><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft /></button><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight /></button></div></header>
    <div className="operating-calendar-weekdays">{["SUN","MON","TUE","WED","THU","FRI","SAT"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="operating-calendar-grid">{days.map((date) => { const key = dayKey(date); const currentMonth = date.getMonth() === cursor.getMonth(); const isToday = key === dayKey(today); const active = dueKeys.has(key); return <div key={key} className={`${currentMonth ? "" : "outside"} ${isToday ? "today" : ""} ${active ? "active" : ""}`}><span>{date.getDate()}</span>{active && <i />}</div>; })}</div>
    <footer>{upcoming.length ? upcoming.map((task) => <div className="operating-calendar-item" key={task.id}><Clock3 /><div><strong>{task.title}</strong><span>{task.dueDate ? new Date(task.dueDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : `Recurring · ${task.recurrence}`}</span></div></div>) : <p>No scheduled work is currently recorded.</p>}</footer>
  </section>;
}

function dayKey(date: Date) {
  if (Number.isNaN(date.getTime())) return "invalid";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
