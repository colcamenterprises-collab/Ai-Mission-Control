import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import "./business-hub.css";

type BusinessItem = {
  id?: number | string;
  title?: string;
  name?: string;
  description?: string;
  preview?: string;
  content?: string;
  category?: string;
  status?: string;
  source?: string;
  updatedAt?: string;
  createdAt?: string;
};

type BusinessSection = {
  key: "memory" | "skills" | "projects";
  title: string;
  subtitle: string;
  endpoint: string;
  items: BusinessItem[];
};

type ExplorerView = "list" | "graph";
type Point = { x: number; y: number };
type GraphTransform = { x: number; y: number; scale: number };

const SOURCES: Omit<BusinessSection, "items">[] = [
  { key: "memory", title: "Memory", subtitle: "What James knows", endpoint: "/api/memories" },
  { key: "skills", title: "Skills", subtitle: "What James can do", endpoint: "/api/skills" },
  { key: "projects", title: "Projects", subtitle: "Where James works", endpoint: "/api/projects" },
];

function authHeaders(json = false) {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return {
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
  };
}

function normalizePayload(payload: unknown): BusinessItem[] {
  if (Array.isArray(payload)) return payload as BusinessItem[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["items", "data", "results", "skills", "projects", "memories"]) {
    if (Array.isArray(record[key])) return record[key] as BusinessItem[];
  }
  return [];
}

function itemTitle(item: BusinessItem) { return item.title || item.name || "Untitled"; }
function itemDescription(item: BusinessItem) { return item.description || item.preview || ""; }
function itemLabel(item: BusinessItem) { return item.category || item.source || ""; }
function itemKey(item: BusinessItem, index = 0) { return String(item.id ?? `${itemTitle(item)}-${index}`); }

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function DensityStrip({ count }: { count: number }) {
  const visible = Math.min(12, count);
  return <div className="business-density" aria-label={`${count} records`}>{Array.from({ length: 12 }, (_, index) => <span key={index} className={index < visible ? "is-filled" : ""} />)}</div>;
}

function SectionCard({ section, onOpen }: { section: BusinessSection; onOpen: () => void }) {
  const visibleItems = section.items.slice(0, 6);
  const remaining = Math.max(0, section.items.length - visibleItems.length);
  return (
    <article className={`business-section-card business-section-${section.key}`}>
      <header className="business-section-header">
        <button className="business-section-heading-button" type="button" onClick={onOpen}><span className="business-section-kicker">{section.subtitle}</span><h2>{section.title}</h2></button>
        <div className="business-section-total"><strong>{section.items.length}</strong><span>records</span></div>
      </header>
      <div className="business-section-visual"><DensityStrip count={section.items.length} /><div className="business-section-rule" /></div>
      <div className="business-section-details">
        {visibleItems.length ? visibleItems.map((item, index) => (
          <button className="business-detail-row" type="button" onClick={onOpen} key={`${section.key}-${item.id ?? index}`}>
            <div className="business-detail-main"><div className="business-detail-titleline"><strong>{itemTitle(item)}</strong>{item.status?.trim() && <span className="business-status">{item.status}</span>}</div>{itemDescription(item) && <p>{itemDescription(item)}</p>}</div>
            <div className="business-detail-meta">{itemLabel(item) && <span>{itemLabel(item)}</span>}{formatDate(item.updatedAt || item.createdAt) && <time>{formatDate(item.updatedAt || item.createdAt)}</time>}</div>
          </button>
        )) : <div className="business-section-empty"><strong>No {section.title.toLowerCase()} recorded yet</strong><span>{section.key === "memory" ? "Persistent business and project knowledge will appear here." : section.key === "skills" ? "James's available capabilities will appear here." : "Active business and system projects will appear here."}</span></div>}
      </div>
      <footer className="business-section-footer"><span>{section.items.length ? `${section.items.length} total ${section.title.toLowerCase()} records` : "Waiting for operational data"}</span>{section.items.length > 0 && <button type="button" onClick={onOpen}>{remaining > 0 ? `View all · +${remaining} more` : "View all"}</button>}</footer>
    </article>
  );
}

function createLayout(items: BusinessItem[]) {
  const positions: Record<string, Point> = {};
  const centerX = 500;
  const centerY = 330;
  items.forEach((item, index) => {
    const ringIndex = Math.floor(index / 10);
    const ringStart = ringIndex * 10;
    const ringCount = Math.min(10, items.length - ringStart);
    const angle = (Math.PI * 2 * (index - ringStart)) / Math.max(ringCount, 1) - Math.PI / 2;
    const radius = 105 + ringIndex * 92;
    positions[itemKey(item, index)] = { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
  });
  return positions;
}

function MemoryGraph({ items, onSelect }: { items: BusinessItem[]; onSelect: (item: BusinessItem) => void }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointerMap = useRef(new Map<number, Point>());
  const panStart = useRef<{ point: Point; transform: GraphTransform } | null>(null);
  const pinchStart = useRef<{ distance: number; midpoint: Point; transform: GraphTransform } | null>(null);
  const nodeDrag = useRef<{ pointerId: number; key: string; point: Point; position: Point } | null>(null);
  const baseLayout = useMemo(() => createLayout(items), [items]);
  const [positions, setPositions] = useState<Record<string, Point>>(baseLayout);
  const [transform, setTransform] = useState<GraphTransform>({ x: 0, y: 0, scale: 1 });
  const [showLabels, setShowLabels] = useState(true);
  const [showConnections, setShowConnections] = useState(true);

  useEffect(() => {
    setPositions((current) => Object.fromEntries(Object.entries(baseLayout).map(([key, point]) => [key, current[key] ?? point])));
  }, [baseLayout]);

  const graph = useMemo(() => {
    const titles = new Map(items.map((item, index) => [itemTitle(item).toLowerCase(), index]));
    const edges: Array<{ from: number; to: number }> = [];
    items.forEach((item, from) => {
      for (const match of (item.content || "").matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
        const to = titles.get(match[1].trim().toLowerCase());
        if (to !== undefined && to !== from && !edges.some((edge) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from))) edges.push({ from, to });
      }
    });
    return { edges };
  }, [items]);

  const clientScale = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: rect?.width ? 1000 / rect.width : 1, y: rect?.height ? 680 / rect.height : 1 };
  };

  const clampScale = (scale: number) => Math.min(3.5, Math.max(0.35, scale));
  const zoomBy = (factor: number) => setTransform((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
  const fitAll = () => setTransform({ x: 0, y: 0, scale: 1 });
  const resetLayout = () => { setPositions(baseLayout); setTransform({ x: 0, y: 0, scale: 1 }); };

  const onCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerMap.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerMap.current.size === 1) panStart.current = { point: { x: event.clientX, y: event.clientY }, transform };
    if (pointerMap.current.size === 2) {
      const [a, b] = Array.from(pointerMap.current.values());
      pinchStart.current = { distance: Math.hypot(b.x - a.x, b.y - a.y), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, transform };
    }
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointerMap.current.has(event.pointerId)) return;
    pointerMap.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const scale = clientScale();
    if (pointerMap.current.size >= 2 && pinchStart.current) {
      const [a, b] = Array.from(pointerMap.current.values());
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nextScale = clampScale(pinchStart.current.transform.scale * (distance / pinchStart.current.distance));
      setTransform({ x: pinchStart.current.transform.x + (midpoint.x - pinchStart.current.midpoint.x) * scale.x, y: pinchStart.current.transform.y + (midpoint.y - pinchStart.current.midpoint.y) * scale.y, scale: nextScale });
    } else if (panStart.current) {
      setTransform({ ...panStart.current.transform, x: panStart.current.transform.x + (event.clientX - panStart.current.point.x) * scale.x, y: panStart.current.transform.y + (event.clientY - panStart.current.point.y) * scale.y });
    }
  };

  const endCanvasPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointerMap.current.delete(event.pointerId);
    if (pointerMap.current.size < 2) pinchStart.current = null;
    if (pointerMap.current.size === 0) panStart.current = null;
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? 0.9 : 1.1);
  };

  const startNodeDrag = (event: ReactPointerEvent<SVGGElement>, key: string) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    nodeDrag.current = { pointerId: event.pointerId, key, point: { x: event.clientX, y: event.clientY }, position: positions[key] ?? baseLayout[key] ?? { x: 500, y: 330 } };
  };

  const moveNode = (event: ReactPointerEvent<SVGGElement>) => {
    const drag = nodeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const scale = clientScale();
    setPositions((current) => ({ ...current, [drag.key]: { x: drag.position.x + ((event.clientX - drag.point.x) * scale.x) / transform.scale, y: drag.position.y + ((event.clientY - drag.point.y) * scale.y) / transform.scale } }));
  };

  const endNodeDrag = (event: ReactPointerEvent<SVGGElement>, item: BusinessItem) => {
    if (nodeDrag.current?.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - nodeDrag.current.point.x, event.clientY - nodeDrag.current.point.y) > 5;
    nodeDrag.current = null;
    event.stopPropagation();
    if (!moved) onSelect(item);
  };

  return (
    <div className="business-memory-graph-wrap">
      <div className="memory-graph-controls" aria-label="Memory graph controls">
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
        <button type="button" onClick={fitAll}>Fit all</button>
        <button type="button" onClick={resetLayout}>Reset</button>
        <label><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} /> Labels</label>
        <label><input type="checkbox" checked={showConnections} onChange={(event) => setShowConnections(event.target.checked)} /> Links</label>
        <span>{Math.round(transform.scale * 100)}%</span>
      </div>
      <div className="memory-graph-stage">
        <svg ref={svgRef} className="business-memory-graph" viewBox="0 0 1000 680" role="img" aria-label={`Interactive graph of ${items.length} memory records`} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={endCanvasPointer} onPointerCancel={endCanvasPointer} onWheel={onWheel}>
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            {showConnections && graph.edges.map((edge, index) => {
              const fromItem = items[edge.from]; const toItem = items[edge.to];
              const from = positions[itemKey(fromItem, edge.from)] ?? baseLayout[itemKey(fromItem, edge.from)];
              const to = positions[itemKey(toItem, edge.to)] ?? baseLayout[itemKey(toItem, edge.to)];
              return from && to ? <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="memory-graph-edge" /> : null;
            })}
            {items.map((item, index) => {
              const key = itemKey(item, index); const point = positions[key] ?? baseLayout[key];
              if (!point) return null;
              return (
                <g key={key} className="memory-graph-node" transform={`translate(${point.x} ${point.y})`} onPointerDown={(event) => startNodeDrag(event, key)} onPointerMove={moveNode} onPointerUp={(event) => endNodeDrag(event, item)} onPointerCancel={(event) => { if (nodeDrag.current?.pointerId === event.pointerId) nodeDrag.current = null; }} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(item); }}>
                  <circle r={10 + Math.min(7, itemTitle(item).length / 22)} />
                  {showLabels && <text x="16" y="4">{itemTitle(item).slice(0, 32)}</text>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="business-memory-graph-note">Drag the canvas to pan, pinch or scroll to zoom, and drag individual nodes to arrange the workspace. Connections use Obsidian-style <code>[[wikilinks]]</code>.</p>
    </div>
  );
}

function Explorer({ section, onClose, onMemoryUpdated, onMemoryDeleted }: { section: BusinessSection; onClose: () => void; onMemoryUpdated: (item: BusinessItem) => void; onMemoryDeleted: (id: number | string) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<ExplorerView>(section.key === "memory" ? "graph" : "list");
  const [selected, setSelected] = useState<BusinessItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [saving, setSaving] = useState(false);
  const categories = useMemo(() => Array.from(new Set(section.items.map((item) => item.category).filter(Boolean) as string[])).sort(), [section.items]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return section.items.filter((item) => (category === "all" || item.category === category) && (!normalized || [itemTitle(item), itemDescription(item), item.content || "", itemLabel(item)].some((value) => value.toLowerCase().includes(normalized))));
  }, [query, category, section.items]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") editing ? setEditing(false) : selected ? setSelected(null) : onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, onClose, selected]);

  const startEdit = () => { if (!selected) return; setMutationError(""); setDraftTitle(itemTitle(selected)); setDraftContent(selected.content || selected.description || selected.preview || ""); setEditing(true); };

  const saveEdit = async () => {
    if (!selected?.id) return;
    setSaving(true); setMutationError("");
    try {
      const response = await fetch(`/api/memories/${selected.id}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ title: draftTitle.trim(), content: draftContent }) });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to update memory");
      const updated = payload as BusinessItem;
      onMemoryUpdated(updated); setSelected(updated); setEditing(false);
    } catch (error) { setMutationError(error instanceof Error ? error.message : "Unable to update memory"); }
    finally { setSaving(false); }
  };

  const deleteMemory = async () => {
    if (!selected?.id || !window.confirm(`Delete “${itemTitle(selected)}”? This cannot be undone.`)) return;
    setSaving(true); setMutationError("");
    try {
      const response = await fetch(`/api/memories/${selected.id}`, { method: "DELETE", headers: authHeaders() });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to delete memory");
      onMemoryDeleted(selected.id); setSelected(null); setEditing(false);
    } catch (error) { setMutationError(error instanceof Error ? error.message : "Unable to delete memory"); }
    finally { setSaving(false); }
  };

  return (
    <div className="business-explorer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`business-explorer business-explorer-${section.key}`} role="dialog" aria-modal="true" aria-label={`${section.title} explorer`}>
        <header className="business-explorer-header"><div><span>{section.subtitle}</span><h2>{section.title}</h2><p>{section.items.length} records · {filtered.length} shown</p></div><button className="business-explorer-close" type="button" onClick={onClose} aria-label="Close explorer">×</button></header>
        <div className="business-explorer-toolbar">
          <div className="business-explorer-search-group"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section.title.toLowerCase()}…`} aria-label={`Search ${section.title}`} />{section.key === "memory" && categories.length > 1 && <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter memory category"><option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select>}</div>
          {section.key === "memory" && <div className="business-view-toggle" aria-label="Memory view"><button type="button" className={view === "graph" ? "is-active" : ""} onClick={() => setView("graph")}>Graph</button><button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>List</button></div>}
        </div>
        <div className="business-explorer-body">
          {section.key === "memory" && view === "graph" ? <MemoryGraph items={filtered} onSelect={(item) => { setMutationError(""); setEditing(false); setSelected(item); }} /> : (
            <div className="business-explorer-list">{filtered.map((item, index) => <button type="button" className="business-explorer-row" key={`${section.key}-${item.id ?? index}`} onClick={() => { setMutationError(""); setEditing(false); setSelected(item); }}><div><strong>{itemTitle(item)}</strong>{itemDescription(item) && <p>{itemDescription(item)}</p>}</div><span>{itemLabel(item)}</span></button>)}{!filtered.length && <div className="business-explorer-empty">No matching records.</div>}</div>
          )}
          {selected && (
            <aside className="business-record-panel" aria-label={`${itemTitle(selected)} details`}>
              <button className="business-record-close" type="button" onClick={() => { setSelected(null); setEditing(false); setMutationError(""); }} aria-label="Close record">×</button>
              <span>{itemLabel(selected)}</span>
              {editing ? <div className="business-memory-editor"><label>Title<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></label><label>Content<textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} rows={16} /></label><div className="business-record-actions"><button type="button" className="is-primary" onClick={saveEdit} disabled={saving || !draftTitle.trim()}>{saving ? "Saving…" : "Save"}</button><button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button></div></div> : <><h3>{itemTitle(selected)}</h3><p className="business-record-date">{formatDate(selected.updatedAt || selected.createdAt)}</p><div className="business-record-content">{selected.content || selected.description || selected.preview || "No additional detail recorded."}</div>{section.key === "memory" && <div className="business-record-actions"><button type="button" className="is-primary" onClick={startEdit}>Edit</button><button type="button" className="is-danger" onClick={deleteMemory} disabled={saving}>{saving ? "Working…" : "Delete"}</button></div>}</>}
              {mutationError && <div className="business-record-error" role="alert">{mutationError}</div>}
            </aside>
          )}
        </div>
      </section>
    </div>
  );
}

export default function BusinessHub() {
  const [sections, setSections] = useState<BusinessSection[]>(SOURCES.map((source) => ({ ...source, items: [] })));
  const [activeKey, setActiveKey] = useState<BusinessSection["key"] | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all(SOURCES.map(async (source) => { try { const response = await fetch(source.endpoint, { headers: authHeaders() }); if (!response.ok) return { ...source, items: [] }; return { ...source, items: normalizePayload(await response.json()) }; } catch { return { ...source, items: [] }; } })).then((next) => { if (!cancelled) setSections(next as BusinessSection[]); });
    return () => { cancelled = true; };
  }, []);
  const activeSection = activeKey ? sections.find((section) => section.key === activeKey) || null : null;
  const updateMemory = (updated: BusinessItem) => setSections((current) => current.map((section) => section.key === "memory" ? { ...section, items: section.items.map((item) => item.id === updated.id ? updated : item) } : section));
  const deleteMemory = (id: number | string) => setSections((current) => current.map((section) => section.key === "memory" ? { ...section, items: section.items.filter((item) => item.id !== id) } : section));

  return <div className="mission-business-page business-board-page"><div className="mission-business-canvas business-board-canvas"><header className="mission-business-header business-board-header"><div><h1>Business</h1><p>James&apos;s working context, capability and active systems.</p></div></header><section className="business-board-grid" aria-label="Memory, Skills and Projects">{sections.map((section) => <SectionCard key={section.key} section={section} onOpen={() => setActiveKey(section.key)} />)}</section></div>{activeSection && <Explorer section={activeSection} onClose={() => setActiveKey(null)} onMemoryUpdated={updateMemory} onMemoryDeleted={deleteMemory} />}</div>;
}
