import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FilePlus2, Paperclip, Trash2 } from "lucide-react";
import "./task-enhancements.css";

type TaskItem = {
  id: number;
  title: string;
  status: string;
  attachments?: Array<{ name: string; url?: string }>;
};

type TaskDetails = TaskItem & {
  attachments?: Array<{ name: string; url?: string }>;
};

function authHeaders(extra: Record<string, string> = {}) {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
    ...extra,
  };
}

function laneForStatus(status: string) {
  if (["backlog", "ready"].includes(status)) return "To-Do";
  if (status === "done") return "Done";
  return "Doing";
}

export function TaskEnhancements() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [summaryNode, setSummaryNode] = useState<HTMLElement | null>(null);
  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null);
  const [details, setDetails] = useState<TaskDetails | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/tasks", { headers: authHeaders() });
        if (!response.ok) return;
        const next = await response.json() as TaskItem[];
        if (!cancelled) setTasks(next);
      } catch {
        // The native task page remains functional if this enhancement cannot refresh.
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const card = target?.closest<HTMLElement>(".mc-task-card");
      const id = Number(card?.dataset.taskId);
      if (Number.isInteger(id) && id > 0) setActiveTaskId(id);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const decorate = () => {
      const used = new Set<number>();
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".mc-task-card"));
      for (const card of cards) {
        const title = card.querySelector("h3")?.textContent?.trim() ?? "";
        const lane = card.closest(".mc-task-lane")?.querySelector(".mc-task-lane-header h2")?.textContent?.trim() ?? "";
        const candidates = tasks.filter((task) => task.title === title && laneForStatus(task.status) === lane && !used.has(task.id));
        const fallback = tasks.filter((task) => task.title === title && !used.has(task.id));
        const match = candidates[0] ?? fallback[0];
        if (!match) continue;
        used.add(match.id);
        card.dataset.taskId = String(match.id);
        if (!card.querySelector(".mc-task-id-badge")) {
          const badge = document.createElement("span");
          badge.className = "mc-task-id-badge";
          badge.textContent = `#${match.id}`;
          card.insertBefore(badge, card.firstChild);
        }
      }

      const modal = document.querySelector<HTMLElement>(".mc-task-detail-modal");
      const summary = modal?.querySelector<HTMLElement>(".mc-task-summary-pane") ?? null;
      const header = modal?.querySelector<HTMLElement>(".mc-task-modal-header") ?? null;
      setSummaryNode((current) => current === summary ? current : summary);
      setHeaderNode((current) => current === header ? current : header);

      if (modal && !activeTaskId) {
        const modalTitle = modal.querySelector(".mc-task-modal-header h2")?.textContent?.trim() ?? "";
        const matches = tasks.filter((task) => task.title === modalTitle);
        if (matches.length === 1) setActiveTaskId(matches[0].id);
      }

      if (!modal) {
        setActiveTaskId(null);
        setDetails(null);
      }

      if (summary) {
        for (const section of Array.from(summary.querySelectorAll<HTMLElement>(".mc-task-detail-section"))) {
          if (section.querySelector("h3")?.textContent?.trim() === "Attachments") section.style.display = "none";
        }
      }
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [tasks, activeTaskId]);

  async function refreshDetails(taskId: number) {
    const response = await fetch(`/api/tasks/${taskId}/details`, { headers: authHeaders() });
    if (response.ok) setDetails(await response.json() as TaskDetails);
    const tasksResponse = await fetch("/api/tasks", { headers: authHeaders() });
    if (tasksResponse.ok) setTasks(await tasksResponse.json() as TaskItem[]);
  }

  useEffect(() => {
    if (!activeTaskId || !summaryNode) return;
    void refreshDetails(activeTaskId);
  }, [activeTaskId, summaryNode]);

  const activeTask = useMemo(
    () => details ?? tasks.find((task) => task.id === activeTaskId) ?? null,
    [details, tasks, activeTaskId],
  );

  async function uploadFiles(files: FileList | null) {
    if (!activeTaskId || !files?.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MB file limit.`);
        const response = await fetch(`/api/tasks/${activeTaskId}/attachments`, {
          method: "POST",
          headers: authHeaders({
            "Content-Type": "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
          }),
          body: file,
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error || `Unable to upload ${file.name}`);
        }
      }
      await refreshDetails(activeTaskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload attachment");
    } finally {
      setUploading(false);
    }
  }

  async function downloadAttachment(attachment: { name: string; url?: string }) {
    if (!attachment.url) return;
    setError("");
    try {
      const response = await fetch(attachment.url, { headers: authHeaders() });
      if (!response.ok) throw new Error(`Unable to download ${attachment.name}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to download attachment");
    }
  }

  async function removeAttachment(attachment: { name: string; url?: string }) {
    if (!activeTaskId || !attachment.url) return;
    if (!window.confirm(`Remove ${attachment.name} from Task #${activeTaskId}?`)) return;
    setError("");
    try {
      const response = await fetch(attachment.url, { method: "DELETE", headers: authHeaders() });
      if (!response.ok) throw new Error(`Unable to remove ${attachment.name}`);
      await refreshDetails(activeTaskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove attachment");
    }
  }

  return (
    <>
      {headerNode && activeTaskId && createPortal(
        <span className="mc-task-id-detail">Task #{activeTaskId}</span>,
        headerNode,
      )}
      {summaryNode && activeTaskId && createPortal(
        <section className="mc-task-files-panel">
          <div className="mc-task-files-heading">
            <div><h3>Files & Documents</h3><span>Permanent attachments for Task #{activeTaskId}</span></div>
            <label className={`mc-task-file-add ${uploading ? "is-busy" : ""}`}>
              <FilePlus2 aria-hidden="true" />
              <span>{uploading ? "Uploading…" : "Add files"}</span>
              <input
                type="file"
                multiple
                disabled={uploading}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp"
                onChange={(event) => {
                  void uploadFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          <div className="mc-task-files-list">
            {(activeTask?.attachments ?? []).length ? (activeTask?.attachments ?? []).map((attachment, index) => (
              <div className="mc-task-file-row" key={`${attachment.name}-${attachment.url ?? index}`}>
                <button className="mc-task-file-name" disabled={!attachment.url} onClick={() => void downloadAttachment(attachment)} title={attachment.url ? `Download ${attachment.name}` : "Legacy attachment name only"}>
                  <Paperclip aria-hidden="true" />
                  <span>{attachment.name}</span>
                </button>
                {attachment.url ? <button className="mc-task-file-remove" onClick={() => void removeAttachment(attachment)} aria-label={`Remove ${attachment.name}`}><Trash2 aria-hidden="true" /></button> : <small>Legacy</small>}
              </div>
            )) : <p>No files attached yet.</p>}
          </div>
          {error && <p className="mc-task-files-error">{error}</p>}
          <small className="mc-task-files-help">PDF, Office, CSV, text and common images · maximum 20 MB per file.</small>
        </section>,
        summaryNode,
      )}
    </>
  );
}
