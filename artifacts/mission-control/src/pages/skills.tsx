import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetSkill, useListSkills, type SkillMetadata } from "@/lib/skills-api";
import "./workspaces.css";
import "./skills-page.css";

type PlaybookGroupKey = "product" | "standard" | "spec" | "local";

type PlaybookGroup = {
  key: PlaybookGroupKey;
  title: string;
  eyebrow: string;
  description: string;
  helper: string;
  tone: "violet" | "green" | "blue" | "aqua";
  skills: SkillMetadata[];
};

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

function getPlaybookGroup(skill: SkillMetadata): PlaybookGroupKey {
  const path = skill.path?.toLowerCase() ?? "";
  const category = skill.category?.toLowerCase() ?? "";
  const id = skill.id?.toLowerCase() ?? "";

  if (path.includes("agent-os/product") || category === "product" || id.includes("agent-os:product")) return "product";
  if (path.includes("agent-os/standards") || category === "standard" || category === "standards" || id.includes("agent-os:standards")) return "standard";
  if (path.includes("agent-os/specs") || category === "spec" || category === "specs" || id.includes("agent-os:specs")) return "spec";
  return "local";
}

function buildGroups(skills: SkillMetadata[]): PlaybookGroup[] {
  const groups: PlaybookGroup[] = [
    {
      key: "product",
      title: "Product Direction",
      eyebrow: "What we are building",
      description: "Mission, roadmap and technology direction that keep workers aligned before they act.",
      helper: "North-star documents",
      tone: "violet",
      skills: [],
    },
    {
      key: "standard",
      title: "Operating Standards",
      eyebrow: "How workers behave",
      description: "Rules for safe execution, reporting, repo discipline and business-owner control.",
      helper: "Required standards",
      tone: "green",
      skills: [],
    },
    {
      key: "spec",
      title: "Current Specs",
      eyebrow: "What is being changed now",
      description: "Active implementation plans and feature specs used to keep work scoped and verifiable.",
      helper: "Active build layer",
      tone: "blue",
      skills: [],
    },
    {
      key: "local",
      title: "Local Worker Skills",
      eyebrow: "Practical worker playbooks",
      description: "Hands-on instructions used by Mission Control workers for coding, operations and reporting.",
      helper: "Execution playbooks",
      tone: "aqua",
      skills: [],
    },
  ];

  const byKey = new Map(groups.map((group) => [group.key, group]));
  for (const skill of skills) {
    byKey.get(getPlaybookGroup(skill))?.skills.push(skill);
  }

  return groups.filter((group) => group.skills.length > 0);
}

function PlaybookCard({ skill, expanded, tone, onToggle }: { skill: SkillMetadata; expanded: boolean; tone: PlaybookGroup["tone"]; onToggle: () => void }) {
  const detail = useGetSkill(expanded ? skill.id : null);
  const description = skill.description?.trim();

  return (
    <article className={`playbook-card playbook-card-${tone} ${expanded ? "is-open" : ""}`}>
      <button type="button" className="playbook-card-main" onClick={onToggle} aria-expanded={expanded}>
        <div className="playbook-card-copy">
          <span className="playbook-label">{cleanCategory(skill.category)}</span>
          <h3>{skill.title || skill.name}</h3>
          {description && <p>{description}</p>}
          <small>{shortPath(skill.path)} · Updated {formatDate(skill.lastUpdated)}</small>
        </div>
        <div className="playbook-card-action">
          <Badge variant="outline" className="playbook-badge">{expanded ? "Open" : "Ready"}</Badge>
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
  const groups = useMemo(() => buildGroups(skills), [skills]);
  const agentOsCount = groups.filter((group) => group.key !== "local").reduce((total, group) => total + group.skills.length, 0);

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="playbooks-canvas">
        <header className="playbooks-header">
          <div>
            <p>Agent OS layer</p>
            <h1>Playbooks your AI workers follow.</h1>
            <span>Product direction, standards, current specs and worker skills in one operating layer.</span>
          </div>
          <div className="playbooks-header-stats" aria-label="Playbook summary">
            <strong>{skills.length}</strong>
            <span>Total playbooks</span>
            <small>{agentOsCount} Agent OS docs</small>
          </div>
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
          <section className="playbook-groups" aria-label="Playbooks grouped by operating layer">
            {groups.map((group) => (
              <section key={group.key} className={`playbook-group playbook-group-${group.tone}`}>
                <div className="playbook-group-head">
                  <div>
                    <span>{group.eyebrow}</span>
                    <h2>{group.title}</h2>
                    <p>{group.description}</p>
                  </div>
                  <div className="playbook-group-count">
                    <strong>{group.skills.length}</strong>
                    <small>{group.helper}</small>
                  </div>
                </div>
                <div className="playbooks-grid">
                  {group.skills.map((skill) => (
                    <PlaybookCard
                      key={skill.id}
                      skill={skill}
                      tone={group.tone}
                      expanded={expandedId === skill.id}
                      onToggle={() => setExpandedId((current) => current === skill.id ? null : skill.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
