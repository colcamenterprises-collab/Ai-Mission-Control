import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getListTasksQueryKey } from "@workspace/api-client-react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
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
  if (status === "review") return "Review";
  if (status === "done") return "Done";
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
      setDashboardNode(document.querySelector<HTMLElement>(".mission-operations-home"));
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
    const onCaptureRoute = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a");
      const href = anchor?.getAttribute("href") ?? "";
      if (!href.includes("/tasks?create=note")) return;
      event.preventDefault();
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      window.location.assign(`${base}/notes?create=note`);
    };
    document.addEventListener("click", onCaptureRoute, true);
    return () => document.removeEventListener("click", onCaptureRoute, true);
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

  return <>
    {taskWorkspaceNode && createPortal(<AutomationCalendar tasks={tasks} context="tasks" />, taskWorkspaceNode)}
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
  }).slice(0, 2);

  return <section className={`operating-calendar operating-calendar-${context}`}>
    <header><div><span><CalendarDays /> Automations</span><h2>{cursor.toLocaleDateString([], { month: "long", year: "numeric" })}</h2></div><div className="operating-calendar-nav"><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft /></button><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight /></button></div></header>
    <div className="operating-calendar-weekdays">{["S","M","T","W","T","F","S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
    <div className="operating-calendar-grid">{days.map((date) => { const key = dayKey(date); const currentMonth = date.getMonth() === cursor.getMonth(); const isToday = key === dayKey(today); const active = dueKeys.has(key); return <div key={key} className={`${currentMonth ? "" : "outside"} ${isToday ? "today" : ""} ${active ? "active" : ""}`}><span>{date.getDate()}</span>{active && <i />}</div>; })}</div>
    <footer>{upcoming.length ? upcoming.map((task) => <div className="operating-calendar-item" key={task.id}><Clock3 /><div><strong>{task.title}</strong><span>{task.dueDate ? new Date(task.dueDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : `Recurring · ${task.recurrence}`}</span></div></div>) : <p>No scheduled work.</p>}</footer>
  </section>;
}

function dayKey(date: Date) {
  if (Number.isNaN(date.getTime())) return "invalid";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
