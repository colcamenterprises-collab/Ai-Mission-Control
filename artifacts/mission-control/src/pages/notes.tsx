import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, FileText, FlaskConical, Gavel, Lightbulb, Plus, Search, Sparkles, X } from "lucide-react";
import "./notes.css";

type NoteKind = "note" | "idea" | "research" | "decision" | "reference";
type InboxItem = {
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

const kinds: Array<{ value: NoteKind; label: string }> = [
  { value: "note", label: "Note" },
  { value: "idea", label: "Idea" },
  { value: "research", label: "Research" },
  { value: "decision", label: "Decision" },
  { value: "reference", label: "Reference" },
];

function authHeaders() {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}) };
}

function KindIcon({ kind }: { kind: NoteKind }) {
  if (kind === "idea") return <Lightbulb />;
  if (kind === "research") return <FlaskConical />;
  if (kind === "decision") return <Gavel />;
  if (kind === "reference") return <BookOpen />;
  return <FileText />;
}

export default function Notes() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | NoteKind>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<NoteKind>("note");
  const [editing, setEditing] = useState<InboxItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const response = await fetch("/api/inbox", { headers: authHeaders() });
      if (!response.ok) throw new Error(`Unable to load notes (HTTP ${response.status})`);
      setItems(await response.json());
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load notes"); }
  }

  useEffect(() => {
    void refresh();
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("create");
    if (requested && kinds.some((kind) => kind.value === requested)) { setComposerKind(requested as NoteKind); setComposerOpen(true); }
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (!needle) return true;
      return `${item.title ?? ""} ${item.content} ${item.orchestratorComment ?? ""} ${item.kind}`.toLowerCase().includes(needle);
    });
  }, [items, query, kindFilter]);

  async function mutate(id: number, path: string, method: "PATCH" | "POST" = "POST", body?: object) {
    setBusyId(id); setError("");
    try {
      const response = await fetch(`/api/inbox/${id}${path}`, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `Unable to update note (HTTP ${response.status})`);
      }
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update note"); }
    finally { setBusyId(null); }
  }

  function openNew(kind: NoteKind = "note") { setEditing(null); setComposerKind(kind); setComposerOpen(true); }

  return (
    <div className="notes-page">
      <header className="notes-header">
        <div><span className="notes-kicker">Capture · Obsidian backed</span><h1>Notes & Ideas</h1><p>Capture thoughts before they become organisational truth. Notes sync with the Obsidian vault; deliberately promote validated knowledge into Mission Brain or convert actionable work into Tasks.</p></div>
        <div className="notes-create-actions"><button className="notes-primary" onClick={() => openNew("note")}><Plus /> New note</button><button className="notes-secondary" onClick={() => openNew("idea")}><Lightbulb /> New idea</button></div>
      </header>

      <div className="notes-toolbar">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes and ideas" /></label>
        <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as "all" | NoteKind)} aria-label="Filter note type"><option value="all">All types</option>{kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select>
        <span>{visible.length} item{visible.length === 1 ? "" : "s"}</span>
      </div>

      {error && <div className="notes-error">{error}</div>}

      <main className="notes-grid">
        {visible.length ? visible.map((item) => (
          <article className={`note-paper note-kind-${item.kind} note-state-${item.reviewStatus}`} key={item.id}>
            <header><div><span className="note-type"><KindIcon kind={item.kind} /> {item.kind}</span>{item.reviewStatus === "reviewed" && <span className="note-reviewed"><Check /> Reviewed</span>}{item.reviewStatus === "promoted" && <span className="note-reviewed"><Sparkles /> In Mission Brain</span>}</div><button className="note-icon-button" onClick={() => { setEditing(item); setComposerKind(item.kind); setComposerOpen(true); }} aria-label="Edit note">Edit</button></header>
            {item.title && <h2>{item.title}</h2>}
            <p className="note-content">{item.content}</p>
            {item.orchestratorComment && <div className="note-orchestrator"><Sparkles /><div><strong>Agent review</strong><p>{item.orchestratorComment}</p></div></div>}
            <footer>
              <button disabled={busyId === item.id || item.reviewStatus === "promoted"} onClick={() => void mutate(item.id, "/promote-memory")}>{item.reviewStatus === "promoted" ? "In Mission Brain" : "Promote to Memory"}</button>
              <button disabled={busyId === item.id || Boolean(item.linkedTaskId)} onClick={() => void mutate(item.id, "/convert")}>{item.linkedTaskId ? "Task created" : "Convert to Task"}</button>
              {item.reviewStatus === "unreviewed" && <button disabled={busyId === item.id} onClick={() => void mutate(item.id, "", "PATCH", { reviewStatus: "reviewed" })}>Mark reviewed</button>}
              <button disabled={busyId === item.id} onClick={() => void mutate(item.id, "/archive")}>Archive</button>
            </footer>
          </article>
        )) : <div className="notes-empty"><FileText /><strong>No matching notes</strong><span>Capture first. Promote to Mission Brain only when the information deserves to become durable knowledge.</span><button onClick={() => openNew("note")}>Create a note</button></div>}
      </main>

      {composerOpen && <NoteComposer item={editing} initialKind={composerKind} onClose={() => { setComposerOpen(false); setEditing(null); }} onSaved={async () => { setComposerOpen(false); setEditing(null); await refresh(); }} />}
    </div>
  );
}

function NoteComposer({ item, initialKind, onClose, onSaved }: { item: InboxItem | null; initialKind: NoteKind; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const [kind, setKind] = useState<NoteKind>(item?.kind ?? initialKind);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!content.trim()) { setError("Write something before saving."); return; }
    setSaving(true); setError("");
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      const response = await fetch(item ? `/api/inbox/${item.id}` : "/api/inbox", { method: item ? "PATCH" : "POST", headers: authHeaders(), signal: controller.signal, body: JSON.stringify(item ? { title: title.trim() || null, content, kind } : { title: title.trim() || null, content, kind, source: "typed", createdBy: "Owner" }) });
      window.clearTimeout(timeout);
      if (!response.ok) { const payload = await response.json().catch(() => ({})) as { error?: string }; throw new Error(payload.error || `Unable to save note (HTTP ${response.status})`); }
      await onSaved();
    } catch (caught) { setError(caught instanceof DOMException && caught.name === "AbortError" ? "Saving timed out. Mission Control did not confirm the save." : caught instanceof Error ? caught.message : "Unable to save note"); }
    finally { setSaving(false); }
  }

  return <div className="notes-modal-backdrop" onMouseDown={onClose}><section className="notes-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><header><div><span>{item ? "Edit capture" : "Quick capture"}</span><h2>{item ? "Edit note" : "New note"}</h2></div><button onClick={onClose} aria-label="Close"><X /></button></header><label>Type<select value={kind} onChange={(event) => setKind(event.target.value as NoteKind)}>{kinds.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Title <small>optional</small><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short summary" /></label><label>Note<textarea rows={14} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Type, paste dot points, or use Android voice-to-text…" /></label>{error && <p className="notes-modal-error">{error}</p>}<footer><button onClick={onClose}>Cancel</button><button className="notes-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save note"}</button></footer></section></div>;
}
