import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  Check,
  CheckSquare2,
  ChevronLeft,
  FileText,
  FolderKanban,
  Gavel,
  Lightbulb,
  List,
  ListOrdered,
  Mic,
  MoreHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import "./note-composer.css";

export type NoteKind = "note" | "idea" | "research" | "decision" | "reference";

export type InboxItem = {
  id: number;
  title: string | null;
  content: string;
  kind: NoteKind;
  reviewStatus: string;
  source?: string;
  orchestratorComment?: string | null;
  linkedTaskId: number | null;
  linkedProjectId: number | null;
  createdAt?: string;
  updatedAt?: string;
};

type Project = { id: number; name: string; description?: string | null };
type ChecklistItem = { id: string; text: string; checked: boolean };

type Props = {
  item?: InboxItem | null;
  initialKind?: NoteKind;
  startVoice?: boolean;
  onClose: () => void;
  onSaved?: (item: InboxItem) => void | Promise<void>;
};

const kinds: Array<{ value: NoteKind; label: string; icon: typeof FileText }> = [
  { value: "note", label: "Note", icon: FileText },
  { value: "idea", label: "Idea", icon: Lightbulb },
  { value: "research", label: "Research", icon: BookOpen },
  { value: "decision", label: "Decision", icon: Gavel },
  { value: "reference", label: "Reference", icon: FileText },
];

export function missionAuthHeaders() {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}) };
}

function uid() {
  return `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseChecklist(content: string): ChecklistItem[] | null {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length || !lines.every((line) => /^\s*-\s*\[[ xX]\]\s+/.test(line))) return null;
  return lines.map((line) => {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
    return { id: uid(), checked: Boolean(match && /x/i.test(match[1])), text: match?.[2] ?? line };
  });
}

function serializeChecklist(items: ChecklistItem[]) {
  return items
    .filter((entry) => entry.text.trim())
    .map((entry) => `- [${entry.checked ? "x" : " "}] ${entry.text.trim()}`)
    .join("\n");
}

function normalizeProjectId(value: number | null | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

export default function NoteComposer({ item = null, initialKind = "note", startVoice = false, onClose, onSaved }: Props) {
  const initialChecklist = useMemo(() => parseChecklist(item?.content ?? ""), [item]);
  const [title, setTitle] = useState(item?.title ?? "");
  const [kind, setKind] = useState<NoteKind>(item?.kind ?? initialKind);
  const [projectId, setProjectId] = useState<number | null>(normalizeProjectId(item?.linkedProjectId));
  const [text, setText] = useState(initialChecklist ? "" : item?.content ?? "");
  const [checklistMode, setChecklistMode] = useState(Boolean(initialChecklist));
  const [completedOpen, setCompletedOpen] = useState(true);
  const [projectQuery, setProjectQuery] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(initialChecklist ?? [{ id: uid(), text: "", checked: false }]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [metaOpen, setMetaOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState<InboxItem | null>(item);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const content = checklistMode ? serializeChecklist(checklist) : text.trimEnd();
  const project = projects.find((entry) => entry.id === projectId) ?? null;
  const filteredProjects = projects.filter((entry) => entry.name.toLowerCase().includes(projectQuery.trim().toLowerCase()));

  useEffect(() => {
    let active = true;
    fetch("/api/projects", { headers: missionAuthHeaders(), cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((payload) => { if (active && Array.isArray(payload)) setProjects(payload); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const checklistHandler = () => setChecklistMode(true);
    window.addEventListener("mission-note-checklist", checklistHandler);
    return () => window.removeEventListener("mission-note-checklist", checklistHandler);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void saveAndClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  function blobToDataUrl(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error); reader.onload = () => resolve(String(reader.result ?? "")); reader.readAsDataURL(blob); }); }

  async function transcribeVoice(blob: Blob) {
    setTranscribing(true); setError("");
    try {
      const dataUrl = await blobToDataUrl(blob);
      const response = await fetch("/api/james/message", { method: "POST", headers: missionAuthHeaders(), body: JSON.stringify({ voiceAction: "transcribe", data_url: dataUrl, mime_type: blob.type || "audio/webm" }) });
      if (!response.ok) throw new Error(`Voice transcription failed (HTTP ${response.status})`);
      const payload = await response.json() as { transcript?: string; text?: string };
      const transcript = String(payload.transcript ?? payload.text ?? "").trim();
      if (!transcript) throw new Error("No speech was detected");
      setChecklistMode(false); setText((current) => current.trim() ? `${current.trimEnd()}\n${transcript}` : transcript);
      window.setTimeout(() => textRef.current?.focus(), 0);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to transcribe voice note"); } finally { setTranscribing(false); }
  }

  async function toggleVoice() {
    if (recording && recorderRef.current) { recorderRef.current.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Voice capture is not supported by this browser"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream; chunksRef.current = []; const recorder = new MediaRecorder(stream); recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => { const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }); stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; recorderRef.current = null; setRecording(false); if (blob.size) void transcribeVoice(blob); };
      recorder.start(); setRecording(true);
    } catch { setError("Microphone access is required for a voice note"); }
  }

  useEffect(() => { if (startVoice) void toggleVoice(); return () => { streamRef.current?.getTracks().forEach((track) => track.stop()); }; }, []);

  function clearCompleted() { setChecklist((current) => { const remaining = current.filter((entry) => !entry.checked); return remaining.length ? remaining : [{ id: uid(), text: "", checked: false }]; }); }

  function convertChecklist() {
    if (checklistMode) {
      setText(checklist.map((entry) => entry.text).filter(Boolean).join("\n"));
      setChecklistMode(false);
      window.setTimeout(() => textRef.current?.focus(), 0);
      return;
    }
    const lines = text.split(/\r?\n/).map((line) => line.replace(/^\s*[•*-]\s*/, "").trim()).filter(Boolean);
    setChecklist(lines.length ? lines.map((line) => ({ id: uid(), text: line, checked: false })) : [{ id: uid(), text: "", checked: false }]);
    setChecklistMode(true);
  }

  function addNumbered() {
    if (checklistMode) return;
    const lines = text.split(/\r?\n/);
    const next = lines.reduce((count, line) => /^\s*\d+\.\s/.test(line) ? count + 1 : count, 0) + 1;
    setText((current) => current ? `${current.replace(/\s+$/, "")}\n${next}. ` : "1. ");
    window.setTimeout(() => textRef.current?.focus(), 0);
  }

  function addBullet() {
    if (checklistMode) return;
    setText((current) => current ? `${current.replace(/\s+$/, "")}\n• ` : "• ");
    window.setTimeout(() => textRef.current?.focus(), 0);
  }

  function updateChecklist(id: string, patch: Partial<ChecklistItem>) {
    setChecklist((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }

  async function persist(): Promise<InboxItem | null> {
    const cleanContent = content.trim();
    if (!cleanContent) return null;
    if (saving) return lastSaved;
    setSaving(true);
    setError("");
    try {
      const target = lastSaved ?? item;
      const response = await fetch(target ? `/api/inbox/${target.id}` : "/api/inbox", {
        method: target ? "PATCH" : "POST",
        headers: missionAuthHeaders(),
        body: JSON.stringify(target ? {
          title: title.trim() || null,
          content: cleanContent,
          kind,
          linkedProjectId: projectId,
        } : {
          title: title.trim() || null,
          content: cleanContent,
          kind,
          linkedProjectId: projectId,
          source: "typed",
          createdBy: "Owner",
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `Unable to save note (HTTP ${response.status})`);
      }
      const saved = await response.json() as InboxItem;
      setLastSaved(saved);
      await onSaved?.(saved);
      window.dispatchEvent(new CustomEvent("mission-note-saved", { detail: { id: saved.id } }));
      return saved;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save note");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndClose() {
    if (content.trim()) {
      const saved = await persist();
      if (!saved) return;
    }
    onClose();
  }

  async function act(path: string, method: "POST" | "PATCH" = "POST", body?: object) {
    const savedCurrent = content.trim() ? await persist() : (lastSaved ?? item);
    const target = savedCurrent ?? lastSaved ?? item;
    if (!target) return;
    if (path === "/promote-memory" && target.reviewStatus === "promoted") { setMoreOpen(false); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/inbox/${target.id}${path}`, {
        method,
        headers: missionAuthHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `Unable to update note (HTTP ${response.status})`);
      }
      window.dispatchEvent(new CustomEvent("mission-note-saved", { detail: { id: target.id } }));
      if (path === "/archive") onClose();
      else {
        const refreshed = await fetch(`/api/inbox`, { headers: missionAuthHeaders(), cache: "no-store" }).then((response) => response.ok ? response.json() : []);
        const next = Array.isArray(refreshed) ? refreshed.find((entry: InboxItem) => entry.id === target.id) : null;
        if (next) { setLastSaved(next); await onSaved?.(next); }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="note-editor-backdrop" role="presentation" onMouseDown={() => void saveAndClose()}>
      <section className="note-editor" role="dialog" aria-modal="true" aria-label={item ? "Edit note" : "Quick note"} onMouseDown={(event) => event.stopPropagation()}>
        <header className="note-editor-header">
          <button type="button" className="note-editor-icon" onClick={() => void saveAndClose()} aria-label="Close and save note"><ChevronLeft /></button>
          <div className="note-editor-heading"><strong>{item ? "Edit note" : "Quick note"}</strong><span>{project?.name ?? "Inbox / Unassigned"}</span></div>
          <button type="button" className="note-editor-icon" onClick={() => setMoreOpen((value) => !value)} aria-label="More note actions"><MoreHorizontal /></button>
        </header>

        <div className="note-editor-body">
          <input className="note-editor-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" aria-label="Note title" />
          {checklistMode ? (
            <div className="note-checklist-editor">
              {checklist.filter((entry) => !entry.checked).map((entry) => { const index = checklist.findIndex((candidate) => candidate.id === entry.id); return (
                <div className="note-check-row" key={entry.id}>
                  <button type="button" className={`note-check-box ${entry.checked ? "is-checked" : ""}`} onClick={() => updateChecklist(entry.id, { checked: !entry.checked })} aria-label={entry.checked ? "Mark item incomplete" : "Mark item complete"}>{entry.checked && <Check />}</button>
                  <input
                    autoFocus={index === 0}
                    value={entry.text}
                    onChange={(event) => updateChecklist(entry.id, { text: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const next = { id: uid(), text: "", checked: false };
                        setChecklist((current) => {
                          const copy = [...current]; copy.splice(index + 1, 0, next); return copy;
                        });
                        window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-check-id="${next.id}"]`)?.focus(), 0);
                      }
                      if (event.key === "Backspace" && !entry.text && checklist.length > 1) {
                        event.preventDefault();
                        setChecklist((current) => current.filter((candidate) => candidate.id !== entry.id));
                      }
                    }}
                    data-check-id={entry.id}
                    placeholder={index === 0 ? "List item" : "Add another item"}
                  />
                </div>
              ); })}
              {checklist.some((entry) => entry.checked) && <div className="note-completed"><button type="button" onClick={() => setCompletedOpen((value) => !value)}>{completedOpen ? "Hide" : "Show"} completed ({checklist.filter((entry) => entry.checked).length})</button><button type="button" onClick={clearCompleted}>Clear completed</button></div>}
              {completedOpen && checklist.filter((entry) => entry.checked).map((entry) => <div className="note-check-row is-completed" key={entry.id}><button type="button" className="note-check-box is-checked" onClick={() => updateChecklist(entry.id, { checked: false })} aria-label="Mark item incomplete"><Check /></button><input value={entry.text} onChange={(event) => updateChecklist(entry.id, { text: event.target.value })} /></div>)}
              <button type="button" className="note-check-add" onClick={() => setChecklist((current) => [...current, { id: uid(), text: "", checked: false }])}>+ Add item</button>
            </div>
          ) : (
            <textarea ref={textRef} autoFocus className="note-editor-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="Start typing…" />
          )}
          {error && <p className="note-editor-error">{error}</p>}
        </div>

        {moreOpen && (
          <div className="note-editor-more">
            {(lastSaved ?? item) && (lastSaved ?? item)?.reviewStatus !== "promoted" && <button type="button" onClick={() => void act("/promote-memory")}><Sparkles /> Promote to Mission Brain</button>}
            {(lastSaved ?? item) && !(lastSaved ?? item)?.linkedTaskId && <button type="button" onClick={() => void act("/convert")}><CheckSquare2 /> Convert to Task</button>}
            {(lastSaved ?? item)?.reviewStatus === "unreviewed" && <button type="button" onClick={() => void act("", "PATCH", { reviewStatus: "reviewed" })}><Check /> Mark reviewed</button>}
            {(lastSaved ?? item) && <button type="button" onClick={() => void act("/archive")}><Archive /> Archive</button>}
          </div>
        )}

        <footer className="note-editor-toolbar">
          <button type="button" className={checklistMode ? "is-active" : ""} onClick={convertChecklist} aria-label="Toggle checklist"><CheckSquare2 /></button>
          <button type="button" onClick={addBullet} disabled={checklistMode} aria-label="Add bullet point"><List /></button>
          <button type="button" onClick={addNumbered} disabled={checklistMode} aria-label="Add numbered list"><ListOrdered /></button>
          <button type="button" onClick={() => void toggleVoice()} className={recording ? "is-active" : ""} aria-label={recording ? "Stop voice note" : "Record voice note"}><Mic /></button>
          <button type="button" className={projectId ? "is-active" : ""} onClick={() => setMetaOpen(true)} aria-label="Choose project"><FolderKanban /></button>
          <span className="note-editor-save-state">{recording ? "Recording… tap mic to stop" : transcribing ? "Transcribing…" : saving ? "Saving…" : "Auto-saves when closed"}</span>
          <button type="button" className="note-editor-done" onClick={() => void saveAndClose()} disabled={saving}>Done</button>
        </footer>

        {metaOpen && (
          <div className="note-meta-sheet">
            <header><strong>Organise note</strong><button type="button" onClick={() => setMetaOpen(false)} aria-label="Close organise note"><X /></button></header>
            <section>
              <span className="note-meta-label">Project</span>
              <input className="note-project-search" value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} placeholder="Search projects" aria-label="Search projects" />
              <button type="button" className={projectId === null ? "is-selected" : ""} onClick={() => { setProjectId(null); setMetaOpen(false); }}>Inbox / Unassigned</button>
              {filteredProjects.map((entry) => <button type="button" key={entry.id} className={projectId === entry.id ? "is-selected" : ""} onClick={() => { setProjectId(entry.id); setMetaOpen(false); }}>{entry.name}</button>)}
            </section>
            <section>
              <span className="note-meta-label">Type</span>
              {kinds.map((entry) => {
                const Icon = entry.icon;
                return <button type="button" key={entry.value} className={kind === entry.value ? "is-selected" : ""} onClick={() => setKind(entry.value)}><Icon /> {entry.label}</button>;
              })}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
