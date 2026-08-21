import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Plus, Search, Sparkles, X } from "lucide-react";
import "./notes.css";

type InboxItem = {
  id: number;
  title: string | null;
  content: string;
  reviewStatus: string;
  orchestratorComment?: string | null;
  linkedTaskId: number | null;
  linkedProjectId: number | null;
  createdAt?: string;
  updatedAt?: string;
};

function authHeaders() {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
  };
}

export default function Notes() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<InboxItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const response = await fetch("/api/inbox", { headers: authHeaders() });
      if (!response.ok) throw new Error(`Unable to load notes (HTTP ${response.status})`);
      setItems(await response.json());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load notes");
    }
  }

  useEffect(() => {
    void refresh();
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "note") setComposerOpen(true);
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.title ?? ""} ${item.content} ${item.orchestratorComment ?? ""}`.toLowerCase().includes(needle));
  }, [items, query]);

  async function mutate(id: number, path: string, method: "PATCH" | "POST" = "POST", body?: object) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/inbox/${id}${path}`, {
        method,
        headers: authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `Unable to update note (HTTP ${response.status})`);
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update note");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="notes-page">
      <header className="notes-header">
        <div>
          <span className="notes-kicker">Capture</span>
          <h1>Notes</h1>
          <p>Thoughts, reminders, voice transcripts and quick to-dos. Nothing here is a Task until you deliberately promote it.</p>
        </div>
        <button className="notes-primary" onClick={() => { setEditing(null); setComposerOpen(true); }}><Plus /> New note</button>
      </header>

      <div className="notes-toolbar">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" /></label>
        <span>{visible.length} item{visible.length === 1 ? "" : "s"}</span>
      </div>

      {error && <div className="notes-error">{error}</div>}

      <main className="notes-grid">
        {visible.length ? visible.map((item) => (
          <article className={`note-paper note-state-${item.reviewStatus}`} key={item.id}>
            <header>
              <div>
                <span className="note-type"><FileText /> Note</span>
                {item.reviewStatus === "reviewed" && <span className="note-reviewed"><Check /> Reviewed</span>}
              </div>
              <button className="note-icon-button" onClick={() => { setEditing(item); setComposerOpen(true); }} aria-label="Edit note">Edit</button>
            </header>
            {item.title && <h2>{item.title}</h2>}
            <p className="note-content">{item.content}</p>
            {item.orchestratorComment && <div className="note-orchestrator"><Sparkles /><div><strong>James</strong><p>{item.orchestratorComment}</p></div></div>}
            <footer>
              <button disabled={busyId === item.id || Boolean(item.linkedTaskId)} onClick={() => void mutate(item.id, "/convert")}>{item.linkedTaskId ? "Task created" : "Convert to Task"}</button>
              {item.reviewStatus === "unreviewed" && <button disabled={busyId === item.id} onClick={() => void mutate(item.id, "", "PATCH", { reviewStatus: "reviewed" })}>Mark reviewed</button>}
              <button disabled={busyId === item.id} onClick={() => void mutate(item.id, "/archive")}>Archive</button>
            </footer>
          </article>
        )) : <div className="notes-empty"><FileText /><strong>No notes yet</strong><span>Use this space like a scratchpad. Capture first; decide what becomes work later.</span><button onClick={() => setComposerOpen(true)}>Create your first note</button></div>}
      </main>

      {composerOpen && <NoteComposer item={editing} onClose={() => { setComposerOpen(false); setEditing(null); }} onSaved={async () => { setComposerOpen(false); setEditing(null); await refresh(); }} />}
    </div>
  );
}

function NoteComposer({ item, onClose, onSaved }: { item: InboxItem | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!content.trim()) { setError("Write something before saving."); return; }
    setSaving(true);
    setError("");
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      const response = await fetch(item ? `/api/inbox/${item.id}` : "/api/inbox", {
        method: item ? "PATCH" : "POST",
        headers: authHeaders(),
        signal: controller.signal,
        body: JSON.stringify(item ? { title: title.trim() || null, content } : { title: title.trim() || null, content, source: "typed", createdBy: "Owner" }),
      });
      window.clearTimeout(timeout);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `Unable to save note (HTTP ${response.status})`);
      }
      await onSaved();
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === "AbortError" ? "Saving timed out. Mission Control did not confirm the save." : caught instanceof Error ? caught.message : "Unable to save note");
    } finally {
      setSaving(false);
    }
  }

  return <div className="notes-modal-backdrop" onMouseDown={onClose}><section className="notes-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><header><div><span>{item ? "Edit capture" : "Quick capture"}</span><h2>{item ? "Edit note" : "New note"}</h2></div><button onClick={onClose} aria-label="Close"><X /></button></header><label>Title <small>optional</small><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short summary" /></label><label>Note<textarea rows={14} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Type, paste dot points, or use Android voice-to-text…" /></label>{error && <p className="notes-modal-error">{error}</p>}<footer><button onClick={onClose}>Cancel</button><button className="notes-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save note"}</button></footer></section></div>;
}
