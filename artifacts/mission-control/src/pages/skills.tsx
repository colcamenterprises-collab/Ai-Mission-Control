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

function shortPath(path: string): string {
  if (!path || path === "UNMAPPED") return "Mission Control instruction";
  return path.replace(/^library\//, "").replace(/^agent-os\//, "");
}

function cleanTitle(value: string): string {
  return value
    .replace(/^Mission Control\s+/i, "")
    .replace(/^Spec:\s*/i, "")
    .replace(/\s+Playbook$/i, "")
    .trim();
}

function AgentInstructionCard({ instruction, expanded, onToggle }: { instruction: SkillMetadata; expanded: boolean; onToggle: () => void }) {
  const detail = useGetSkill(expanded ? instruction.id : null);
  const description = instruction.description?.trim();
  const title = cleanTitle(instruction.title || instruction.name);

  return (
    <article className={`playbook-card playbook-card-violet ${expanded ? "is-open" : ""}`}>
      <button type="button" className="playbook-card-main" onClick={onToggle} aria-expanded={expanded}>
        <div className="playbook-card-copy">
          <h3>{title}</h3>
          {description && <p>{description}</p>}
          <small>{shortPath(instruction.path)} · Updated {formatDate(instruction.lastUpdated)}</small>
        </div>
        <div className="playbook-card-action">
          <Badge variant="outline" className="playbook-badge">{expanded ? "Open" : "Ready"}</Badge>
          <span>{expanded ? "Hide" : "Read"}</span>
        </div>
      </button>

      {expanded && (
        <div className="playbook-accordion">
          {detail.isLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : detail.error ? (
            <p className="playbook-error">Could not load this instruction.</p>
          ) : detail.data ? (
            <pre>{detail.data.content}</pre>
          ) : (
            <p className="playbook-empty">Choose Read to open this instruction.</p>
          )}
        </div>
      )}
    </article>
  );
}

export default function Skills() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, error } = useListSkills();
  const instructions = data?.skills ?? [];

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="playbooks-canvas">
        <header className="playbooks-header">
          <div>
            <h1>Agent Instructions</h1>
            <span>Simple instructions your agents use to complete work correctly.</span>
          </div>
          <div className="playbooks-header-stats" aria-label="Agent instructions summary">
            <strong>{instructions.length}</strong>
            <span>Instructions ready</span>
            <small>Used during work</small>
          </div>
        </header>

        {isLoading ? (
          <div className="playbooks-grid">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-3xl" />)}
          </div>
        ) : error ? (
          <div className="playbook-state">Could not load agent instructions.</div>
        ) : instructions.length === 0 ? (
          <div className="playbook-state">No agent instructions have been added yet.</div>
        ) : (
          <section className="playbooks-grid" aria-label="Agent instructions">
            {instructions.map((instruction) => (
              <AgentInstructionCard
                key={instruction.id}
                instruction={instruction}
                expanded={expandedId === instruction.id}
                onToggle={() => setExpandedId((current) => current === instruction.id ? null : instruction.id)}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
