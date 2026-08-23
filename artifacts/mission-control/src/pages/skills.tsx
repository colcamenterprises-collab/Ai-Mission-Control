import { useState } from "react";
import { RefreshCw } from "lucide-react";
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
function shortPath(path: string): string { if (!path || path === "UNMAPPED") return "Mission Control instruction"; return path.replace(/^library\//, "").replace(/^agent-os\//, "").replace(/^vault\//, ""); }
function cleanTitle(value: string): string { return value.replace(/^Mission Control\s+/i, "").replace(/^Spec:\s*/i, "").replace(/\s+Playbook$/i, "").trim(); }
function authHeaders() { const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken"); return { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}) }; }

function AgentInstructionCard({ instruction, expanded, onToggle, onGovern, governing }: { instruction: SkillMetadata; expanded: boolean; onToggle: () => void; onGovern: (status: string) => void; governing: boolean }) {
  const detail = useGetSkill(expanded ? instruction.id : null);
  const description = instruction.description?.trim();
  const title = cleanTitle(instruction.title || instruction.name);
  const isVault = instruction.source.sourceRepo === "obsidian-vault";
  const status = instruction.status ?? (instruction.source.enabled ? "approved" : "needs-review");
  return <article className={`playbook-card playbook-card-violet ${expanded ? "is-open" : ""}`}><button type="button" className="playbook-card-main" onClick={onToggle} aria-expanded={expanded}><div className="playbook-card-copy"><div className="flex flex-wrap items-center gap-2"><h3>{title}</h3>{isVault && <Badge variant="outline" className="text-xs">Vault · {status}</Badge>}</div>{description && <p>{description}</p>}<small>{shortPath(instruction.path)} · Updated {formatDate(instruction.lastUpdated)}</small></div><div className="playbook-card-action"><Badge variant="outline" className="playbook-badge">{instruction.source.enabled ? "Ready" : status}</Badge><span>{expanded ? "Hide" : "Read"}</span></div></button>{expanded && <div className="playbook-accordion">{isVault && <div className="mb-3 flex flex-wrap gap-2"><button type="button" disabled={governing || status === "approved"} onClick={() => onGovern("approved")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">Approve</button><button type="button" disabled={governing || status === "needs-review"} onClick={() => onGovern("needs-review")} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Needs Review</button><button type="button" disabled={governing || status === "deprecated"} onClick={() => onGovern("deprecated")} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Deprecate</button></div>}{detail.isLoading ? <Skeleton className="h-40 w-full rounded-2xl" /> : detail.error ? <p className="playbook-error">Could not load this instruction.</p> : detail.data ? <pre>{detail.data.content}</pre> : <p className="playbook-empty">Choose Read to open this instruction.</p>}</div>}</article>;
}

export default function Skills() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [governingId, setGoverningId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const { data, isLoading, error, refetch } = useListSkills();
  const instructions = data?.skills ?? [];
  const sources = data?.sources ?? data?.origins ?? [];
  const approvedCount = instructions.filter((item) => item.source.enabled).length;
  const reviewCount = instructions.filter((item) => item.source.sourceRepo === "obsidian-vault" && item.status !== "approved" && item.status !== "deprecated").length;

  async function sync() {
    setSyncing(true); setSyncMessage("");
    try {
      const response = await fetch("/api/skills/sync", { method: "POST", headers: authHeaders() });
      const payload = await response.json().catch(() => ({})) as { skills?: unknown[]; error?: string };
      if (!response.ok) throw new Error(payload.error || `Skill sync failed (HTTP ${response.status})`);
      await refetch();
      setSyncMessage(`Sync complete. ${payload.skills?.length ?? instructions.length} skills discovered.`);
    } catch (caught) { setSyncMessage(caught instanceof Error ? caught.message : "Skill sync failed"); }
    finally { setSyncing(false); }
  }

  async function govern(id: string, status: string) {
    setGoverningId(id); setSyncMessage("");
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(id)}/status`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ status }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `Skill governance failed (HTTP ${response.status})`);
      await refetch();
      setSyncMessage(`Skill status changed to ${status}.`);
    } catch (caught) { setSyncMessage(caught instanceof Error ? caught.message : "Skill governance failed"); }
    finally { setGoverningId(null); }
  }

  return <div className="workspaces-shell flex h-full flex-col overflow-y-auto"><div className="playbooks-canvas"><header className="playbooks-header"><div><h1>Agent Instructions</h1><p className="text-sm text-muted-foreground mt-2">Canonical Skills and operating playbooks available to Mission Control agents. Vault skills only become routable after approval.</p></div><div className="playbooks-header-stats" aria-label="Agent instructions summary"><strong>{approvedCount}</strong><span>Instructions ready</span><small>{reviewCount ? `${reviewCount} awaiting review · ` : ""}{sources.length} source{sources.length === 1 ? "" : "s"} registered</small></div></header><div className="mb-5 flex flex-wrap items-center gap-3"><button className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={() => void sync()} disabled={syncing}><RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />{syncing ? "Syncing…" : "Sync Skills"}</button>{syncMessage && <span className="text-xs text-muted-foreground">{syncMessage}</span>}{sources.map((source) => <Badge key={source.id} variant="outline" className="text-xs">{source.sourceLabel}: {source.status} · {source.skillCount}</Badge>)}</div>{isLoading ? <div className="playbooks-grid">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-3xl" />)}</div> : error ? <div className="playbook-state">Could not load agent instructions.</div> : instructions.length === 0 ? <div className="playbook-state"><strong>No agent instructions are currently discoverable.</strong><br/>Run Sync Skills above. A skill is not considered installed until it appears here.</div> : <section className="playbooks-grid" aria-label="Agent instructions">{instructions.map((instruction) => <AgentInstructionCard key={instruction.id} instruction={instruction} expanded={expandedId === instruction.id} onToggle={() => setExpandedId((current) => current === instruction.id ? null : instruction.id)} onGovern={(status) => void govern(instruction.id, status)} governing={governingId === instruction.id} />)}</section>}</div></div>;
}
