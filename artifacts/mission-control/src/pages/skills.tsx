import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetSkill, useListSkills, useSyncSkills, type SkillMetadata, type SkillSourceStatus } from "@/lib/skills-api";
import "./workspaces.css";

function formatDate(value: string | null): string {
  if (!value) return "Not checked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function importStatusLabel(value: string | null | undefined) {
  if (!value || value === "NULL") return "Not imported";
  return value.replaceAll("_", " ");
}

function OriginStatusTable({ sources }: { sources: SkillSourceStatus[] }) {
  if (!sources.length) return null;
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-border/70">
      <table className="w-full text-left text-xs">
        <thead className="bg-secondary/35 text-muted-foreground">
          <tr><th className="p-3">Library</th><th className="p-3">Checked</th><th className="p-3">Status</th><th className="p-3">Playbooks</th></tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.id} className="border-t border-border/70">
              <td className="p-3">{source.sourceRepo || source.sourceUrl || source.id}</td>
              <td className="p-3 text-muted-foreground">{formatDate(source.lastSyncTime)}</td>
              <td className="p-3">{importStatusLabel(source.status)}</td>
              <td className="p-3 text-muted-foreground">{source.skillCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LocalSkillList({ skills, selectedId, onSelect }: { skills: SkillMetadata[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (!skills.length) return <p className="text-sm text-muted-foreground">No playbooks have been added yet.</p>;
  return (
    <div className="space-y-2">
      {skills.map((skill) => (
        <button key={skill.id} onClick={() => onSelect(skill.id)} className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedId === skill.id ? "border-primary/60 bg-primary/10" : "border-border bg-card/60 hover:border-primary/40"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-semibold">{skill.name}</span>
            <Badge variant="outline" className="text-[10px]">{skill.category}</Badge>
          </div>
          <p className="mt-2 truncate text-xs text-muted-foreground">{skill.path}</p>
          <p className="mt-1 text-xs text-muted-foreground">Updated {formatDate(skill.lastUpdated)}</p>
        </button>
      ))}
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  return <pre className="playbook-preview min-h-[24rem] whitespace-pre-wrap rounded-2xl border border-border bg-secondary/25 p-4 text-sm leading-relaxed text-foreground overflow-auto">{content}</pre>;
}

export default function Skills() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, error } = useListSkills();
  const syncSkills = useSyncSkills();
  const skills = data?.skills ?? [];
  const origins = data?.origins ?? data?.sources ?? [];
  const selectedSkillId = selectedId ?? skills[0]?.id ?? null;
  const selected = useMemo(() => skills.find(skill => skill.id === selectedSkillId) ?? null, [skills, selectedSkillId]);
  const detail = useGetSkill(selectedSkillId);

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="workspaces-canvas flex-1 space-y-6">
        <header className="mission-page-hero workspace-panel">
          <p className="workspace-eyebrow">Playbooks</p>
          <h1 className="mission-page-title">How your AI team works.</h1>
          <p className="mission-page-subtitle">Reusable instructions for your AI workers. Keep them simple, searchable and easy to reuse.</p>
        </header>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
          <div className="workspace-panel p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="dashboard-section-title flex items-center gap-2"><BookOpen className="h-4 w-4" /> Playbooks</h2>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => syncSkills.mutate()} disabled={syncSkills.isPending} className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 disabled:opacity-60">{syncSkills.isPending ? "Updating..." : "Update"}</button>
                <Badge variant="outline" className="text-[10px]">{skills.length}</Badge>
              </div>
            </div>
            {syncSkills.error && <p className="mb-3 text-xs text-red-400">Update failed: {syncSkills.error instanceof Error ? syncSkills.error.message : "Unknown error"}</p>}
            {isLoading ? <Skeleton className="h-40 w-full" /> : error ? <p className="text-xs text-red-400">Could not load playbooks.</p> : <><LocalSkillList skills={skills} selectedId={selectedSkillId} onSelect={setSelectedId} /><h2 className="dashboard-section-title mt-6 mb-3">Connected libraries</h2><OriginStatusTable sources={origins} /></>}
          </div>

          <div className="workspace-panel p-4">
            <div className="mb-4">
              <p className="workspace-eyebrow">Preview</p>
              <h2 className="dashboard-section-title mt-1">{selected?.name ?? "No playbook selected"}</h2>
            </div>
            {detail.isLoading ? <Skeleton className="h-96 w-full" /> : detail.error ? <p className="text-xs text-red-400">Could not load this playbook.</p> : detail.data ? <MarkdownPreview content={detail.data.content} /> : <p className="text-sm text-muted-foreground">Choose a playbook to preview it.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
