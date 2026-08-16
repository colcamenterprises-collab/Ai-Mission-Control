import { useEffect, useState } from "react";
import "./business-hub.css";

type BusinessItem = {
  id?: number | string;
  title?: string;
  name?: string;
  description?: string;
  preview?: string;
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

function SectionCard({ section }: { section: BusinessSection }) {
  const visibleItems = section.items.slice(0, 6);
  const remaining = Math.max(0, section.items.length - visibleItems.length);

  return (
    <article className={`business-section-card business-section-${section.key}`}>
      <header className="business-section-header">
        <div>
          <span className="business-section-kicker">{section.subtitle}</span>
          <h2>{section.title}</h2>
        </div>
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
              <div className="business-detail-row" key={`${section.key}-${item.id ?? index}`}>
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
              </div>
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
        {remaining > 0 && <strong>+{remaining} more</strong>}
      </footer>
    </article>
  );
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
      if (!cancelled) setSections(next as BusinessSection[]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
            <SectionCard key={section.key} section={section} />
          ))}
        </section>
      </div>
    </div>
  );
}
