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
  key: string;
  title: string;
  eyebrow: string;
  endpoint: string;
  items: BusinessItem[];
};

const SOURCES = [
  { key: "memory", title: "Memory", eyebrow: "What James knows", endpoint: "/api/memories" },
  { key: "skills", title: "Skills", eyebrow: "What James can do", endpoint: "/api/skills" },
  { key: "projects", title: "Projects", eyebrow: "Where James works", endpoint: "/api/projects" },
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
  const [sections, setSections] = useState<BusinessSection[]>(SOURCES.map((source) => ({ ...source, items: [] })));

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
    return () => { cancelled = true; };
  }, []);

  const total = useMemo(() => sections.reduce((sum, section) => sum + section.items.length, 0), [sections]);
  const maxCount = Math.max(1, ...sections.map((section) => section.items.length));

  return (
    <div className="mission-business-page">
      <div className="mission-business-canvas">
        <header className="mission-business-header">
          <div>
            <h1>Business</h1>
            <p>James&apos;s operational context</p>
          </div>
          <strong>{total} connected records</strong>
        </header>

        <section className="mission-business-map" aria-label="James operational context overview">
          <div className="mission-business-core">
            <span>JAMES</span>
            <strong>Operational Context</strong>
            <small>Knowledge becomes capability. Capability becomes work.</small>
          </div>
          <div className="mission-business-orbits">
            {sections.map((section) => (
              <div className={`mission-business-orbit mission-business-orbit-${section.key}`} key={section.key}>
                <span>{section.title}</span>
                <strong>{section.items.length}</strong>
                <i style={{ width: `${Math.max(8, (section.items.length / maxCount) * 100)}%` }} />
              </div>
            ))}
          </div>
        </section>

        <section className="mission-business-grid" aria-label="Business data overview">
          {sections.map((section) => (
            <article className="mission-business-card" key={section.key}>
              <header>
                <div>
                  <small>{section.eyebrow}</small>
                  <h2>{section.title}</h2>
                </div>
                <b>{section.items.length}</b>
              </header>
              <div className="mission-business-list">
                {section.items.length ? (
                  section.items.slice(0, 6).map((item, index) => (
                    <div className="mission-business-row" key={`${section.key}-${item.id ?? index}`}>
                      <span className="mission-business-marker" aria-hidden="true" />
                      <div>
                        <strong>{itemTitle(item)}</strong>
                        {itemMeta(item) && <small>{itemMeta(item)}</small>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="mission-business-empty">
                    <strong>No {section.title.toLowerCase()} yet</strong>
                    <small>This area will populate as James builds operational context.</small>
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
