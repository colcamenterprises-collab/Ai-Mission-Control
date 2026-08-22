import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { Input } from "@/components/ui/input";

const token = () => localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
async function get<T>(path: string): Promise<T> {
  const value = token();
  const response = await fetch(`/api${path}`, { headers: value ? { Authorization: `Bearer ${value}`, "x-admin-token": value } : {} });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

type Execution = {
  id: number;
  requestedAction: string;
  state: string;
  agentId: number | null;
  taskId: number | null;
  project: string | null;
  business: string | null;
  provider: string | null;
  runtime: string | null;
  riskLevel: number;
  createdAt: string;
  error: string | null;
  providerCost: string | null;
  ownerReport: string | null;
  result: unknown;
  retryCount: number;
};

export default function Executions() {
  const [location] = useLocation();
  const [, legacyParams] = useRoute("/executions/:id");
  const [, brainParams] = useRoute("/brain/executions/:id");
  const params = brainParams ?? legacyParams;
  const inBrain = location.startsWith("/brain/");
  const listHref = inBrain ? "/brain/executions" : "/executions";
  const [query, setQuery] = useState("");
  const list = useQuery({ queryKey: ["executions", query], queryFn: () => get<{ data: Execution[] }>(`/executions?query=${encodeURIComponent(query)}`), enabled: !params?.id });
  const detail = useQuery({ queryKey: ["execution", params?.id], queryFn: () => get<{ request: Execution; transitions: unknown[]; approval: unknown; audit: unknown[] }>(`/executions/${params?.id}`), enabled: Boolean(params?.id) });

  if (params?.id) return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <Link href={listHref}>Back to Mission Brain execution history</Link>
        {detail.isLoading ? <div>Loading…</div> : detail.error || !detail.data ? <div>Execution unavailable.</div> : <>
          <header className="mission-page-hero workspace-panel"><p className="workspace-eyebrow">Mission Brain · Execution #{detail.data.request.id}</p><h1 className="mission-page-title">{detail.data.request.requestedAction}</h1><p className="mission-page-subtitle">{detail.data.request.state} · Risk {detail.data.request.riskLevel} · Cost {detail.data.request.providerCost ?? "UNKNOWN"}</p></header>
          <section className="workspace-panel overflow-auto p-4"><h2 className="font-semibold">Owner report</h2><pre className="mt-3 whitespace-pre-wrap text-sm">{detail.data.request.ownerReport ?? "Not available until completion."}</pre></section>
          <Data title="Result" value={detail.data.request.result} /><Data title="Transitions" value={detail.data.transitions} /><Data title="Approval" value={detail.data.approval} /><Data title="Audit" value={detail.data.audit} />
        </>}
      </div>
    </div>
  );

  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <header className="mission-page-hero workspace-panel"><p className="workspace-eyebrow">Mission Brain · Control</p><h1 className="mission-page-title">Execution history</h1><p className="mission-page-subtitle">Durable worker runs, policy decisions, results, failures, retries, usage and cost.</p>{inBrain && <div className="mt-3"><Link href="/brain">Back to Mission Brain</Link></div>}</header>
        <div className="workspace-panel p-4"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search action or project" /></div>
        <div className="workspace-panel overflow-auto p-4">
          <table className="w-full text-left text-sm"><thead><tr><th>Action</th><th>Status</th><th>Worker</th><th>Task</th><th>Project / Business</th><th>Runtime</th><th>Risk</th><th>Cost</th><th>Started</th></tr></thead><tbody>{list.data?.data.map((row) => <tr className="border-t border-border" key={row.id}><td className="py-2"><Link href={`${listHref}/${row.id}`}>{row.requestedAction}</Link></td><td>{row.state}</td><td>{row.agentId ? `#${row.agentId}` : "UNASSIGNED"}</td><td>{row.taskId ?? "UNKNOWN"}</td><td>{row.project ?? "UNKNOWN"} / {row.business ?? "UNKNOWN"}</td><td>{row.runtime ?? row.provider ?? "UNKNOWN"}</td><td>{row.riskLevel}</td><td>{row.providerCost ?? "UNKNOWN"}</td><td>{new Date(row.createdAt).toLocaleString()}</td></tr>)}</tbody></table>
          {list.error && <p>Execution history unavailable.</p>}{!list.isLoading && !list.data?.data.length && <p>No executions found.</p>}
        </div>
      </div>
    </div>
  );
}

function Data({ title, value }: { title: string; value: unknown }) { return <section className="workspace-panel overflow-auto p-4"><h2 className="font-semibold">{title}</h2><pre className="mt-3 text-xs">{JSON.stringify(value, null, 2)}</pre></section>; }
