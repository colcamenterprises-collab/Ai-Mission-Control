import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetSkill, useListSkills, type SkillMetadata } from "@/lib/skills-api";
import "./workspaces.css";
import "./skills-page.css";

function formatDate(value: string | null): string {
  if (!value) return "Not checked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function cleanCategory(value: string | null | undefined): string {
  if (!value || value === "UNMAPPED") return "General";
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortPath(path: string): string {
  if (!path || path === "UNMAPPED") return "Mission Control playbook";
  return path.replace(/^library\//, "").replace(/^agent-os\//, "");
}

function PlaybookCard({ skill, expanded, tone, onToggle }: { skill: SkillMetadata; expanded: boolean; tone: string; onToggle: () => void }) {
  const detail = useGetSkill(expanded ? skill.id : null);
  const description = skill.description?.trim();

  return (
    <article className={`playbook-card playbook-card-${tone} ${expanded ? "is-open" : ""}`}>
      <button type="button" className="playbook-card-main" onClick={onToggle} aria-expanded={expanded}>
        <div className="playbook-card-copy">
          <span className="playbook-label">{cleanCategory(skill.category)}</span>
          <h2>{skill.title || skill.name}</h2>
          {description && <p>{description}</p>}
          <small>{shortPath(skill.path)} · Updated {formatDate(skill.lastUpdated)}</small>
        </div>
        <div className="playbook-card-action">
          <Badge variant="outline" className="playbook-badge">{cleanCategory(skill.category)}</Badge>
          <span>{expanded ? "Hide" : "Preview"}</span>
        </div>
      </button>

      {expanded && (
        <div className="playbook-accordion">
          {detail.isLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : detail.error ? (
            <p className="playbook-error">Could not load this playbook.</p>
          ) : detail.data ? (
            <pre>{detail.data.content}</pre>
          ) : (
            <p className="playbook-empty">Choose Preview to read this playbook.</p>
          )}
        </div>
      )}
    </article>
  );
}

export default function Skills() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, error } = useListSkills();
  const skills = data?.skills ?? [];
  const tones = ["aqua", "violet", "blue", "green", "amber", "rose"];

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="playbooks-canvas">
        <header className="playbooks-header">
          <div>
            <p>Playbooks</p>
            <h1>Instructions your AI workers follow.</h1>
          </div>
          <span>{skills.length} active</span>
        </header>

        {isLoading ? (
          <div className="playbooks-grid">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-3xl" />)}
          </div>
        ) : error ? (
          <div className="playbook-state">Could not load playbooks.</div>
        ) : skills.length === 0 ? (
          <div className="playbook-state">No playbooks have been added yet.</div>
        ) : (
          <section className="playbooks-grid" aria-label="Playbooks">
            {skills.map((skill, index) => (
              <PlaybookCard
                key={skill.id}
                skill={skill}
                tone={tones[index % tones.length]}
                expanded={expandedId === skill.id}
                onToggle={() => setExpandedId((current) => current === skill.id ? null : skill.id)}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
