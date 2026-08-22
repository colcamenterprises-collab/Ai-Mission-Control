import { useEffect, useMemo, useState } from "react";
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

const SOURCES: Omit<BusinessSection, "items">[] = [
  { key: "memory", title: "Memory", subtitle: "What James knows", endpoint: "/api/memories" },
  { key: "skills", title: "Skills", subtitle: "What James can do", endpoint: "/api/skills" },
  { key: "projects", title: "Projects", subtitle: "Where James works", endpoint: "/api/projects" },
];

function authHeaders() {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return {
    Accept: "application/json",
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

function itemTitle(item: BusinessItem) {
  return item.title || item.name || "Untitled";
}

function itemDescription(item: BusinessItem) {
  return item.description || item.preview || "";
}

function itemLabel(item: BusinessItem) {
  return item.category || item.source || "";
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function DensityStrip({ count }: { count: number }) {
  const visible = Math.min(12, count);
  return (
    <div className="business-density" aria-label={`${count} records`}>
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} className={index < visible ? "is-filled" : ""} />
      ))}
    </div>
  );
}

function SectionCard({ section, onOpen }: { section: BusinessSection; onOpen: () => void }) {
  const visibleItems = section.items.slice(0, 6);
  const remaining = Math.max(0, section.items.length - visibleItems.length);

  return (
    <article className={`business-section-card business-section-${section.key}`}>
      <header className="business-section-header">
        <button className="business-section-heading-button" type="button" onClick={onOpen}>
          <span className="business-section-kicker">{section.subtitle}</span>
          <h2>{section.title}</h2>
        </button>
        <div className="business-section-total">
          <strong>{section.items.length}</strong>
          <span>records</span>
        </div>
      </header>

      <div className="business-section-visual">
        <DensityStrip count={section.items.length} />
        <div className="business-section-rule" />
      </div>

      <div className="business-section-details">
        {visibleItems.length ? (
          visibleItems.map((item, index) => {
            const status = item.status?.trim();
            const label = itemLabel(item);
            const description = itemDescription(item);
            const date = formatDate(item.updatedAt || item.createdAt);

            return (
              <button className="business-detail-row" type="button" onClick={onOpen} key={`${section.key}-${item.id ?? index}`}>
                <div className="business-detail-main">
                  <div className="business-detail-titleline">
                    <strong>{itemTitle(item)}</strong>
                    {status && <span className="business-status">{status}</span>}
                  </div>
                  {description && <p>{description}</p>}
                </div>
                <div className="business-detail-meta">
                  {label && <span>{label}</span>}
                  {date && <time>{date}</time>}
                </div>
              </button>
            );
          })
        ) : (
          <div className="business-section-empty">
            <strong>No {section.title.toLowerCase()} recorded yet</strong>
            <span>{section.key === "memory" ? "Persistent business and project knowledge will appear here." : section.key === "skills" ? "James's available capabilities will appear here." : "Active business and system projects will appear here."}</span>
          </div>
        )}
      </div>

      <footer className="business-section-footer">
        <span>{section.items.length ? `${section.items.length} total ${section.title.toLowerCase()} records` : "Waiting for operational data"}</span>
        {section.items.length > 0 && (
          <button type="button" onClick={onOpen}>
            {remaining > 0 ? `View all · +${remaining} more` : "View all"}
          </button>
        )}
      </footer>
    </article>
  );
}

function MemoryGraph({ items, onSelect }: { items: BusinessItem[]; onSelect: (item: BusinessItem) => void }) {
  const graph = useMemo(() => {
    const titles = new Map(items.map((item, index) => [itemTitle(item).toLowerCase(), index]));
    const nodes = items.map((item, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(items.length, 1) - Math.PI / 2;
      const ring = 118 + (index % 3) * 30;
      return { item, x: 210 + Math.cos(angle) * ring, y: 190 + Math.sin(angle) * ring };
    });
    const edges: Array<{ from: number; to: number }> = [];
    items.forEach((item, from) => {
      const content = item.content || "";
      for (const match of content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
        const to = titles.get(match[1].trim().toLowerCase());
        if (to !== undefined && to !== from && !edges.some((edge) => edge.from === from && edge.to === to)) edges.push({ from, to });
      }
    });
    return { nodes, edges };
  }, [items]);

  return (
    <div className="business-memory-graph-wrap">
      <svg className="business-memory-graph" viewBox="0 0 420 380" role="img" aria-label={`Interactive graph of ${items.length} memory records`}>
        {graph.edges.map((edge, index) => {
          const from = graph.nodes[edge.from];
          const to = graph.nodes[edge.to];
          return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="memory-graph-edge" />;
        })}
        {graph.nodes.map((node, index) => (
          <g key={`${node.item.id ?? index}`} className="memory-graph-node" onClick={() => onSelect(node.item)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(node.item); }}>
            <circle cx={node.x} cy={node.y} r={8 + Math.min(8, itemTitle(node.item).length / 18)} />
            <text x={node.x + 12} y={node.y + 4}>{itemTitle(node.item).slice(0, 24)}</text>
          </g>
        ))}
      </svg>
      <p className="business-memory-graph-note">Connections are drawn from Obsidian-style <code>[[wikilinks]]</code>. Unlinked memories still remain visible as nodes.</p>
    </div>
  );
}

function Explorer({ section, onClose }: { section: BusinessSection; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ExplorerView>(section.key === "memory" ? "graph" : "list");
  const [selected, setSelected] = useState<BusinessItem | null>(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return section.items;
    return section.items.filter((item) => [itemTitle(item), itemDescription(item), item.content || "", itemLabel(item)].some((value) => value.toLowerCase().includes(normalized)));
  }, [query, section.items]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") selected ? setSelected(null) : onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selected]);

  return (
    <div className="business-explorer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`business-explorer business-explorer-${section.key}`} role="dialog" aria-modal="true" aria-label={`${section.title} explorer`}>
        <header className="business-explorer-header">
          <div>
            <span>{section.subtitle}</span>
            <h2>{section.title}</h2>
            <p>{section.items.length} records · {filtered.length} shown</p>
          </div>
          <button className="business-explorer-close" type="button" onClick={onClose} aria-label="Close explorer">×</button>
        </header>

        <div className="business-explorer-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section.title.toLowerCase()}…`} aria-label={`Search ${section.title}`} />
          {section.key === "memory" && (
            <div className="business-view-toggle" aria-label="Memory view">
              <button type="button" className={view === "graph" ? "is-active" : ""} onClick={() => setView("graph")}>Graph</button>
              <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>List</button>
            </div>
          )}
        </div>

        <div className="business-explorer-body">
          {section.key === "memory" && view === "graph" ? (
            <MemoryGraph items={filtered} onSelect={setSelected} />
          ) : (
            <div className="business-explorer-list">
              {filtered.map((item, index) => (
                <button type="button" className="business-explorer-row" key={`${section.key}-${item.id ?? index}`} onClick={() => setSelected(item)}>
                  <div>
                    <strong>{itemTitle(item)}</strong>
                    {itemDescription(item) && <p>{itemDescription(item)}</p>}
                  </div>
                  <span>{itemLabel(item)}</span>
                </button>
              ))}
              {!filtered.length && <div className="business-explorer-empty">No matching records.</div>}
            </div>
          )}

          {selected && (
            <aside className="business-record-panel" aria-label={`${itemTitle(selected)} details`}>
              <button className="business-record-close" type="button" onClick={() => setSelected(null)} aria-label="Close record">×</button>
              <span>{itemLabel(selected)}</span>
              <h3>{itemTitle(selected)}</h3>
              <p className="business-record-date">{formatDate(selected.updatedAt || selected.createdAt)}</p>
              <div className="business-record-content">{selected.content || selected.description || selected.preview || "No additional detail recorded."}</div>
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
    Promise.all(
      SOURCES.map(async (source) => {
        try {
          const response = await fetch(source.endpoint, { headers: authHeaders() });
          if (!response.ok) return { ...source, items: [] };
          const payload = await response.json();
          return { ...source, items: normalizePayload(payload) };
        } catch {
          return { ...source, items: [] };
        }
      }),
    ).then((next) => {
      if (!cancelled) setSections(next as BusinessSection[]);
    });
    return () => { cancelled = true; };
  }, []);

  const activeSection = activeKey ? sections.find((section) => section.key === activeKey) || null : null;

  return (
    <div className="mission-business-page business-board-page">
      <div className="mission-business-canvas business-board-canvas">
        <header className="mission-business-header business-board-header">
          <div>
            <h1>Business</h1>
            <p>James&apos;s working context, capability and active systems.</p>
          </div>
        </header>

        <section className="business-board-grid" aria-label="Memory, Skills and Projects">
          {sections.map((section) => (
            <SectionCard key={section.key} section={section} onOpen={() => setActiveKey(section.key)} />
          ))}
        </section>
      </div>
      {activeSection && <Explorer section={activeSection} onClose={() => setActiveKey(null)} />}
    </div>
  );
}
