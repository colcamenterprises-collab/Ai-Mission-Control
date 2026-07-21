import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAgents,
  useCreateAgent,
  useUpdateAgent,
  useRegenerateAgentToken,
  getListAgentsQueryKey,
  type Agent,
} from "@workspace/api-client-react";
import { Bot, CheckCircle2, Copy, KeyRound, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import "./workspaces.css";
import "./agent-directory.css";

const DEPARTMENTS: Agent["department"][] = ["Developers", "Writers", "Researchers", "Operators"];

type DirectoryAgent = Pick<Agent, "id" | "name" | "role" | "department" | "status" | "avatarInitials" | "isLead" | "isPluggedIn" | "lastActive" | "tasksCompleted" | "successRate"> & { lastPing?: string | null };

function isOnline(agent: { status: Agent["status"]; lastPing?: string | null }): boolean {
  if (agent.status === "active") return true;
  if (!agent.lastPing) return false;
  return Date.now() - new Date(agent.lastPing).getTime() < 120_000;
}

function statusLabel(agent: { status: Agent["status"]; lastPing?: string | null }) {
  if (isOnline(agent)) return "Online";
  if (agent.status === "pending") return "Queued";
  if (agent.status === "error") return "Issue";
  return "Standby";
}

function AgentPortrait({ initials, online }: { initials: string; online: boolean }) {
  return (
    <div className="agent-portrait" aria-hidden="true">
      <div className="agent-portrait-glow" />
      <div className="agent-portrait-face">
        <Bot className="h-7 w-7" />
        <span>{initials}</span>
      </div>
      <span className={online ? "agent-portrait-status online" : "agent-portrait-status"} />
    </div>
  );
}

function AgentDirectoryCard({ agent, onOpen }: { agent: DirectoryAgent; onOpen: () => void }) {
  const online = isOnline(agent);
  return (
    <button type="button" className="agent-directory-card" onClick={onOpen}>
      <AgentPortrait initials={agent.avatarInitials} online={online} />
      <div className="agent-card-copy">
        <h3>{agent.name}</h3>
        <p>{agent.role}</p>
      </div>
      <span className={online ? "agent-status-pill online" : "agent-status-pill"}>{statusLabel(agent)}</span>
    </button>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="agent-copy-button" onClick={() => { navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>
      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function AddAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const createAgent = useCreateAgent();
  const [form, setForm] = useState({ name: "", role: "", department: "Operators" as Agent["department"], endpoint: "" });
  const [error, setError] = useState("");
  const close = () => { setForm({ name: "", role: "", department: "Operators", endpoint: "" }); setError(""); onClose(); };

  const addAgent = async () => {
    if (!form.name.trim() || !form.role.trim()) { setError("Name and role are required."); return; }
    const initials = form.name.trim().split(/\s+/).map((word) => word[0]).join("").toUpperCase().slice(0, 2) || "AG";
    try {
      await createAgent.mutateAsync({ data: { name: form.name.trim(), role: form.role.trim(), department: form.department, isLead: false, avatarInitials: initials, isPluggedIn: Boolean(form.endpoint.trim()), endpoint: form.endpoint.trim() || null, provider: null, model: null, apiKey: null } });
      onCreated();
      close();
    } catch {
      setError("Unable to employ this AI worker.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader><DialogTitle className="mission-dialog-title"><Plus className="h-4 w-4" /> Employ AI worker</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Name</Label><Input autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Hermes" /></div>
          <div className="grid gap-1.5"><Label>Job</Label><Input value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} placeholder="Operations assistant" /></div>
          <div className="grid gap-1.5"><Label>Team</Label><Select value={form.department} onValueChange={(value) => setForm((current) => ({ ...current, department: value as Agent["department"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DEPARTMENTS.map((department) => <SelectItem key={department} value={department}>{department}</SelectItem>)}</SelectContent></Select></div>
          <details className="advanced-token"><summary>Connection endpoint</summary><Input className="mt-2" value={form.endpoint} onChange={(event) => setForm((current) => ({ ...current, endpoint: event.target.value }))} placeholder="https://agent.example.com/dispatch" /></details>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2"><Button size="sm" variant="outline" onClick={close}>Cancel</Button><Button size="sm" onClick={addAgent} disabled={createAgent.isPending}>{createAgent.isPending ? "Adding" : "Employ worker"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AgentDetailDialog({ agent, onClose, onChanged }: { agent: Agent | null; onClose: () => void; onChanged: () => void }) {
  const updateAgent = useUpdateAgent();
  const regenerate = useRegenerateAgentToken();
  const [token, setToken] = useState<string | null>(null);
  if (!agent) return null;
  const online = isOnline(agent);
  const disconnect = async () => { await updateAgent.mutateAsync({ id: agent.id, data: { isPluggedIn: false, provider: null, model: null, apiKey: null, endpoint: null } }); onChanged(); onClose(); };
  const refreshToken = async () => { const result = await regenerate.mutateAsync({ id: agent.id }); setToken(result.inboundToken); onChanged(); };

  return (
    <Dialog open={Boolean(agent)} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader><DialogTitle className="agent-detail-head"><AgentPortrait initials={agent.avatarInitials} online={online} /><span><strong>{agent.name}</strong><em>{agent.role}</em></span></DialogTitle></DialogHeader>
        <div className="agent-detail-grid"><div><span>Team</span><strong>{agent.department}</strong></div><div><span>Status</span><strong>{statusLabel(agent)}</strong></div><div><span>Provider</span><strong>{agent.provider ?? "—"}</strong></div><div><span>Model</span><strong>{agent.model ?? "—"}</strong></div></div>
        <div className="agent-admin-strip"><Button size="sm" variant="outline" onClick={refreshToken} disabled={regenerate.isPending} className="gap-2"><KeyRound className="h-3.5 w-3.5" />{regenerate.isPending ? "Generating" : "Agent token"}</Button><Button size="sm" variant="ghost" onClick={disconnect} disabled={updateAgent.isPending} className="gap-2 text-red-400 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" />Disconnect</Button></div>
        {(token || agent.endpoint) && <div className="agent-token-box">{agent.endpoint && <p><span>Endpoint</span>{agent.endpoint}</p>}{token && <div><span>Token ready</span><CopyButton value={token} /></div>}</div>}
      </DialogContent>
    </Dialog>
  );
}

export default function Team() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const { data: agents = [], isLoading } = useListAgents();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
  const onlineCount = agents.filter((agent) => isOnline(agent)).length;

  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <header className="team-directory-hero workspace-panel">
          <div><span className="dashboard-topline"><Users className="h-3.5 w-3.5" /> AI workers</span><h1 className="mission-page-title">AI Team</h1><p className="mission-page-subtitle">Only real connected workers appear here. No demo agents.</p></div>
          <div className="team-hero-stats"><span><strong>{agents.length}</strong> workers</span><span><strong>{onlineCount}</strong> online</span></div>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-3.5 w-3.5" /> Employ worker</Button>
        </header>
        <section className="agent-directory-grid">
          {isLoading ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-56 rounded-2xl" />) : agents.length ? (
            <>{agents.map((agent) => <AgentDirectoryCard key={`${agent.id}-${agent.name}`} agent={agent} onOpen={() => setSelectedAgent(agent)} />)}<button type="button" className="agent-directory-card agent-add-card" onClick={() => setShowAdd(true)}><div className="agent-add-icon"><Plus className="h-7 w-7" /></div><div className="agent-card-copy"><h3>Employ AI worker</h3><p>Connect Claude, OpenAI, Hermes, Codex or another provider.</p></div><span className="agent-status-pill">Ready</span></button></>
          ) : (
            <button type="button" className="agent-directory-card agent-add-card" onClick={() => setShowAdd(true)}><div className="agent-add-icon"><Plus className="h-7 w-7" /></div><div className="agent-card-copy"><h3>Employ your first AI worker</h3><p>Connect a real agent before routing work outside Mission Control.</p></div><span className="agent-status-pill">Start</span></button>
          )}
        </section>
      </div>
      <AddAgentDialog open={showAdd} onClose={() => setShowAdd(false)} onCreated={invalidate} />
      <AgentDetailDialog agent={selectedAgent} onClose={() => setSelectedAgent(null)} onChanged={invalidate} />
    </div>
  );
}
