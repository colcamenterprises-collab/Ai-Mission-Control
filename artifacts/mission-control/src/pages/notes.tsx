import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  Check,
  FileText,
  Filter,
  FlaskConical,
  Gavel,
  Lightbulb,
  Search,
  Sparkles,
} from "lucide-react";
import NoteComposer, { type InboxItem, type NoteKind, missionAuthHeaders, parseChecklist } from "@/components/note-composer";
import "./notes.css";

type Project = { id: number; name: string };

const kinds: Array<{ value: NoteKind; label: string }> = [
  { value: "note", label: "Notes" },
  { value: "idea", label: "Ideas" },
  { value: "research", label: "Research" },
  { value: "decision", label: "Decisions" },
  { value: "reference", label: "Reference" },
];

function KindIcon({ kind }: { kind: NoteKind }) {
  if (kind === "idea") return <Lightbulb />;
  if (kind === "research") return <FlaskConical />;
  if (kind === "decision") return <Gavel />;
  if (kind === "reference") return <BookOpen />;
  return <FileText />;
}

function shortDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export default function Notes() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | NoteKind>("all");
  const [projectFilter, setProjectFilter] = useState<number | "all" | "inbox">("all");
  const [editing, setEditing] = useState<InboxItem | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<NoteKind>("note");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [notesResponse, projectsResponse] = await Promise.all([
        fetch("/api/inbox", { headers: missionAuthHeaders(), cache: "no-store" }),
        fetch("/api/projects", { headers: missionAuthHeaders(), cache: "no-store" }),
      ]);
      if (!notesResponse.ok) throw new Error(`Unable to load notes (HTTP ${notesResponse.status})`);
      const notesPayload = await notesResponse.json();
      const projectsPayload = projectsResponse.ok ? await projectsResponse.json() : [];
      setItems(Array.isArray(notesPayload) ? notesPayload : []);
      setProjects(Array.isArray(projectsPayload) ? projectsPayload : []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load notes");
    }
  }

  useEffect(() => {
    void refresh();
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("create");
    if (requested && kinds.some((kind) => kind.value === requested)) {
      setComposerKind(requested as NoteKind);
      setComposerOpen(true);
    }
    const handleSaved = () => void refresh();
    window.addEventListener("mission-note-saved", handleSaved);
    return () => window.removeEventListener("mission-note-saved", handleSaved);
  }, []);

  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...items].reverse().filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (projectFilter === "inbox" && item.linkedProjectId) return false;
      if (typeof projectFilter === "number" && item.linkedProjectId !== projectFilter) return false;
      if (!needle) return true;
      const projectName = item.linkedProjectId ? projectNames.get(item.linkedProjectId) ?? "" : "";
      return `${item.title ?? ""} ${item.content} ${item.orchestratorComment ?? ""} ${item.kind} ${projectName}`.toLowerCase().includes(needle);
    });
  }, [items, query, kindFilter, projectFilter, projectNames]);

  function open(item: InboxItem) {
    setEditing(item);
    setComposerKind(item.kind);
    setComposerOpen(true);
  }

  return (
    <div className="notes-page">
      <header className="notes-topbar">
        <div>
          <span className="notes-kicker">Capture workspace</span>
          <h1>Notes & Ideas</h1>
        </div>
        <span className="notes-count">{visible.length} shown · {items.length} total</span>
      </header>

      <section className="notes-search-row" aria-label="Notes search and filters">
        <label className="notes-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes, ideas or projects" /></label>
        <button type="button" className={`notes-filter-button ${filtersOpen ? "is-active" : ""}`} onClick={() => setFiltersOpen((value) => !value)}><Filter /> Filters</button>
      </section>

      <nav className="notes-kind-strip" aria-label="Note type filter">
        <button type="button" className={kindFilter === "all" ? "is-active" : ""} onClick={() => setKindFilter("all")}>All</button>
        {kinds.map((entry) => <button type="button" key={entry.value} className={kindFilter === entry.value ? "is-active" : ""} onClick={() => setKindFilter(entry.value)}>{entry.label}</button>)}
      </nav>

      {filtersOpen && (
        <section className="notes-filter-panel">
          <strong>Project</strong>
          <div>
            <button type="button" className={projectFilter === "all" ? "is-active" : ""} onClick={() => setProjectFilter("all")}>All projects</button>
            <button type="button" className={projectFilter === "inbox" ? "is-active" : ""} onClick={() => setProjectFilter("inbox")}>Inbox / Unassigned</button>
            {projects.map((project) => <button type="button" key={project.id} className={projectFilter === project.id ? "is-active" : ""} onClick={() => setProjectFilter(project.id)}>{project.name}</button>)}
          </div>
        </section>
      )}

      {error && <div className="notes-error">{error}</div>}

      <main className="notes-board" aria-label="Notes and ideas">
        {visible.length ? visible.map((item) => {
          const checklist = parseChecklist(item.content);
          const projectName = item.linkedProjectId ? projectNames.get(item.linkedProjectId) : null;
          const complete = checklist?.filter((entry) => entry.checked).length ?? 0;
          return (
            <article className={`note-card note-kind-${item.kind}`} key={item.id} onClick={() => open(item)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(item); } }}>
              <header>
                <span className="note-card-kind"><KindIcon kind={item.kind} /> {item.kind}</span>
                {item.reviewStatus === "promoted" ? <span className="note-card-state"><Sparkles /> Brain</span> : item.reviewStatus === "reviewed" ? <span className="note-card-state"><Check /> Reviewed</span> : null}
              </header>
              {item.title && <h2>{item.title}</h2>}
              {checklist ? (
                <div className="note-card-checklist">
                  {checklist.slice(0, 6).map((entry) => <div key={entry.id} className={entry.checked ? "is-checked" : ""}><span>{entry.checked ? "✓" : ""}</span><p>{entry.text}</p></div>)}
                  {checklist.length > 6 && <small>+ {checklist.length - 6} more</small>}
                </div>
              ) : <p className="note-card-preview">{item.content}</p>}
              <footer>
                <span>{projectName ?? "Inbox"}</span>
                {checklist && <span>{complete}/{checklist.length}</span>}
                <span>{shortDate(item.updatedAt ?? item.createdAt)}</span>
              </footer>
            </article>
          );
        }) : (
          <div className="notes-empty">
            {items.length ? <Filter /> : <FileText />}
            <strong>{items.length ? "No notes match these filters" : "Capture the thought before it disappears"}</strong>
            <span>{items.length ? "Clear a filter or search term." : "Use the floating + button. Start typing immediately; organise it later."}</span>
          </div>
        )}
      </main>

      {composerOpen && (
        <NoteComposer
          item={editing}
          initialKind={composerKind}
          onClose={() => { setComposerOpen(false); setEditing(null); }}
          onSaved={async () => { await refresh(); }}
        />
      )}
    </div>
  );
}
