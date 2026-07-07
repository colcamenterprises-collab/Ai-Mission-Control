import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetSkill, useListSkills, type SkillMetadata, type SkillSourceStatus } from "@/lib/skills-api";
import "./workspaces.css";

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function SourceStatusTable({ sources }: { sources: SkillSourceStatus[] }) {
  if (!sources.length) return null;
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-secondary/50 font-mono uppercase text-muted-foreground">
          <tr><th className="p-2">Source</th><th className="p-2">Branch</th><th className="p-2">Commit</th><th className="p-2">Status</th><th className="p-2">Last sync</th></tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.id} className="border-t border-border">
              <td className="p-2 font-mono">{source.sourceRepo ?? source.sourceUrl ?? source.id}</td>
              <td className="p-2 font-mono text-muted-foreground">{source.branch ?? "NULL"}</td>
              <td className="p-2 font-mono text-muted-foreground">{source.commitHash ? source.commitHash.slice(0, 12) : "NULL"}</td>
              <td className="p-2">{source.error ?? source.status}</td>
              <td className="p-2 font-mono text-muted-foreground">{source.lastSyncTime ? formatDate(source.lastSyncTime) : "NULL"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkillList({ skills, selectedId, onSelect }: { skills: SkillMetadata[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (!skills.length) {
    return <p className="text-xs text-muted-foreground">No SKILL.md documents detected in the shared skills directory.</p>;
  }
  return (
    <div className="space-y-2">
      {skills.map((skill) => (
        <button
          key={skill.id}
          onClick={() => onSelect(skill.id)}
          className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedId === skill.id ? "border-primary/60 bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{skill.name}</span>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">{skill.category}</Badge>
          </div>
          <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">{skill.path}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">Updated: {formatDate(skill.lastUpdated)}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">Source: {skill.source.sourceRepo ?? skill.source.sourceUrl ?? "local"}</p>
        </button>
      ))}
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <pre className="min-h-[24rem] whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 p-4 font-mono text-xs leading-relaxed text-foreground overflow-auto">
      {content}
    </pre>
  );
}

export default function Skills() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, error } = useListSkills();
  const skills = data?.skills ?? [];
  const sources = data?.sources ?? [];
  const selectedSkillId = selectedId ?? skills[0]?.id ?? null;
  const selected = useMemo(() => skills.find(skill => skill.id === selectedSkillId) ?? null, [skills, selectedSkillId]);
  const detail = useGetSkill(selectedSkillId);

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="workspaces-canvas flex-1 space-y-6">
        <header>
          <p className="workspace-eyebrow">Skills</p>
          <h1 className="mt-2 text-5xl font-medium leading-none tracking-[-0.07em] md:text-6xl">Shared agent skills.</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Markdown instruction documents named SKILL.md are detected from the shared skills directory and exposed to all operational agents.</p>
        </header>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
          <div className="workspace-panel p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="dashboard-section-title flex items-center gap-2"><BookOpen className="h-4 w-4" /> Skill list</h2>
              <Badge variant="outline" className="font-mono text-[10px]">{skills.length}</Badge>
            </div>
            {isLoading ? <Skeleton className="h-40 w-full" /> : error ? <p className="text-xs text-red-400">Failed to load skills.</p> : <><SourceStatusTable sources={sources} /><SkillList skills={skills} selectedId={selectedSkillId} onSelect={setSelectedId} /></>}
          </div>

          <div className="workspace-panel p-4">
            <div className="mb-4">
              <p className="workspace-eyebrow">Skill detail</p>
              <h2 className="dashboard-section-title mt-1">{selected?.name ?? "No skill selected"}</h2>
              {selected && <p className="mt-2 font-mono text-xs text-muted-foreground">{selected.source.sourceRepo ?? selected.source.sourceUrl ?? "local"} · {selected.source.branch ?? "NULL"} · {selected.source.commitHash ?? "NULL"} · {selected.source.filePath ?? selected.path}</p>}
            </div>
            {detail.isLoading ? <Skeleton className="h-96 w-full" /> : detail.data ? <MarkdownPreview content={detail.data.content} /> : <p className="text-xs text-muted-foreground">Select a skill to preview its Markdown.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
