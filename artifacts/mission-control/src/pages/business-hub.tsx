import { useEffect, useMemo, useState } from "react";

type BusinessItem = {
  id?: number | string;
  title?: string;
  name?: string;
  description?: string;
  preview?: string;
  category?: string;
  status?: string;
};

type BusinessSection = {
  key: "memory" | "skills" | "projects";
  title: string;
  endpoint: string;
  statement: string;
  items: BusinessItem[];
};

const SOURCES: Omit<BusinessSection, "items">[] = [
  { key: "memory", title: "Memory", endpoint: "/api/memories", statement: "What James knows" },
  { key: "skills", title: "Skills", endpoint: "/api/skills", statement: "What James can do" },
  { key: "projects", title: "Projects", endpoint: "/api/projects", statement: "What James is working on" },
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

function itemMeta(item: BusinessItem) {
  return item.category || item.status || item.description || item.preview || "";
}

export default function BusinessHub() {
  const [sections, setSections] = useState<BusinessSection[]>(
    SOURCES.map((source) => ({ ...source, items: [] })),
  );
  const [activeKey, setActiveKey] = useState<BusinessSection["key"]>("memory");

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
      if (!cancelled) setSections(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = useMemo(
    () => sections.find((section) => section.key === activeKey) ?? sections[0],
    [activeKey, sections],
  );
  const maxCount = Math.max(1, ...sections.map((section) => section.items.length));

  return (
    <div className="mission-business-page">
      <div className="mission-business-canvas">
        <header className="mission-business-header">
          <div>
            <h1>Business</h1>
            <p>James's operating context — knowledge, capability and active work.</p>
          </div>
        </header>

        <section className="mission-business-map" aria-label="James operating model">
          <div className="mission-business-map-label">JAMES</div>
          <div className="mission-business-map-line" aria-hidden="true" />
          <div className="mission-business-map-nodes">
            {sections.map((section) => {
              const strength = Math.max(8, Math.round((section.items.length / maxCount) * 100));
              return (
                <button
                  type="button"
                  className={`mission-business-node ${activeKey === section.key ? "is-active" : ""}`}
                  key={section.key}
                  onClick={() => setActiveKey(section.key)}
                >
                  <span className="mission-business-node-topline">
                    <strong>{section.title}</strong>
                    <b>{section.items.length}</b>
                  </span>
                  <small>{section.statement}</small>
                  <span className="mission-business-meter" aria-hidden="true">
                    <i style={{ width: `${strength}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mission-business-detail" aria-live="polite">
          <header>
            <div>
              <span className="mission-business-eyebrow">{active.statement}</span>
              <h2>{active.title}</h2>
            </div>
            <b>{active.items.length} total</b>
          </header>

          <div className="mission-business-list">
            {active.items.length ? (
              active.items.slice(0, 12).map((item, index) => (
                <div className="mission-business-row" key={`${active.key}-${item.id ?? index}`}>
                  <span className="mission-business-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="mission-business-copy">
                    <strong>{itemTitle(item)}</strong>
                    {itemMeta(item) && <small>{itemMeta(item)}</small>}
                  </span>
                </div>
              ))
            ) : (
              <div className="mission-business-empty">
                <strong>No {active.title.toLowerCase()} yet.</strong>
                <span>This area will become more useful as James builds persistent context and capability.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
