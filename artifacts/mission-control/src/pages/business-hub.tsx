import { useEffect, useState } from "react";
import { Brain, BookOpen, Boxes, Users } from "lucide-react";

type BusinessItem = {
  id?: number | string;
  title?: string;
  name?: string;
  role?: string;
  description?: string;
  preview?: string;
  category?: string;
  status?: string;
};

type BusinessSection = {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
  items: BusinessItem[];
};

const SOURCES = [
  { key: "knowledge", title: "Knowledge", icon: Brain, endpoint: "/api/memories" },
  { key: "playbooks", title: "Playbooks", icon: BookOpen, endpoint: "/api/skills" },
  { key: "projects", title: "Projects", icon: Boxes, endpoint: "/api/workspaces" },
  { key: "people", title: "People", icon: Users, endpoint: "/api/contacts" },
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
  for (const key of ["items", "data", "results", "skills", "workspaces", "contacts", "memories"]) {
    if (Array.isArray(record[key])) return record[key] as BusinessItem[];
  }
  return [];
}

function itemTitle(item: BusinessItem) {
  return item.title || item.name || "Untitled";
}

function itemMeta(item: BusinessItem) {
  return item.role || item.category || item.status || item.description || item.preview || "";
}

export default function BusinessHub() {
  const [sections, setSections] = useState<BusinessSection[]>(
    SOURCES.map((source) => ({ ...source, items: [] })),
  );

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

  return (
    <div className="mission-business-page">
      <div className="mission-business-canvas">
        <header className="mission-business-header">
          <h1>Business</h1>
          <span>Shared data available to your AI team</span>
        </header>

        <section className="mission-business-grid" aria-label="Business data overview">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <article className="mission-business-card" key={section.key}>
                <header>
                  <Icon aria-hidden="true" />
                  <h2>{section.title}</h2>
                  <b>{section.items.length}</b>
                </header>
                <div className="mission-business-list">
                  {section.items.length ? (
                    section.items.slice(0, 6).map((item, index) => (
                      <div className="mission-business-row" key={`${section.key}-${item.id ?? index}`}>
                        <strong>{itemTitle(item)}</strong>
                        {itemMeta(item) && <small>{itemMeta(item)}</small>}
                      </div>
                    ))
                  ) : (
                    <div className="mission-business-empty">No {section.title.toLowerCase()} added yet.</div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
