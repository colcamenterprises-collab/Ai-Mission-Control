import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAgents,
  useUpdateAgent,
  useRegenerateAgentToken,
  getListAgentsQueryKey,
  type Agent,
} from "@workspace/api-client-react";
import { AlertCircle, Bot, CheckCircle2, Copy, KeyRound, Plus, Send, Trash2, Users, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import "./workspaces.css";
import "./agent-directory.css";

const DEPARTMENTS: Agent["department"][] = ["Developers", "Writers", "Researchers", "Operators"];
const PROVIDERS = [
  { value: "hermes", label: "James Hermes" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude" },
  { value: "webhook", label: "Custom webhook" },
];
const DEFAULT_MODEL: Record<string, string> = {
  hermes: "james-hermes",
  openrouter: "openai/gpt-4o-mini",
  openai: "gpt-4o-mini",
  claude: "claude-3-5-sonnet-latest",
  webhook: "webhook",
};
const DEFAULT_ENDPOINT: Record<string, string> = {
  hermes: "/api/james/message",
  webhook: "",
  openrouter: "",
  openai: "",
  claude: "",
};
const PRIMARY_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_STORAGE_KEY = "missionControlAdminToken";

type RuntimeResult = { ok?: boolean; output?: string | null; error?: string | null; result?: { output?: string | null; error?: string | null } };

function getAdminToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PRIMARY_TOKEN_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) ?? "";
}

async function authedFetch(path: string, init?: RequestInit, timeoutMs = 25_000) {
  const token = getAdminToken();
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (token) { headers.Authorization = `Bearer ${token}`; headers["x-admin-token"] = token; }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { ...init, signal: controller.signal, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
    const text = await response.text();
    const payload = text.trim() ? JSON.parse(text) as RuntimeResult : {};
    if (!response.ok) throw new Error(payload.error ?? payload.result?.error ?? `${response.status} ${response.statusText}`);
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Request timed out. Mission Control did not receive a response.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function isOnline(agent: { status: Agent["status"]; lastPing?: string | null }): boolean {
  if (agent.status === "active") return true;
  if (!agent.lastPing) return false;
  return Date.now() - new Date(agent.lastPing).getTime() < 120_000;
}

function statusLabel(agent: { status: Agent["status"]; lastPing?: string | null }) {
  if (isOnline(agent)) return "Online";
  if (agent.status === "pending") return "Queued";
  if (agent.status === "error") return "Issue";
  return "Offline";
}

function AgentPortrait({ initials, online }: { initials: string; online: boolean }) {
  return <div className="agent-portrait" aria-hidden="true"><div className="agent-portrait-glow" /><div className="agent-portrait-face"><Bot className="h-7 w-7" /><span>{initials}</span></div><span className={online ? "agent-portrait-status online" : "agent-portrait-status"} /></div>;
}

function AgentDirectoryCard({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
  const online = isOnline(agent);
  return <button type="button" className="agent-directory-card" onClick={onOpen}><AgentPortrait initials={agent.avatarInitials} online={online} /><div className="agent-card-copy"><h3>{agent.name}</h3><p>{agent.role}</p><small>{agent.provider ? `${agent.provider}${agent.model ? ` · ${agent.model}` : ""}` : "No provider set"}</small></div><span className={online ? "agent-status-pill online" : "agent-status-pill"}>{statusLabel(agent)}</span></button>;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="agent-copy-button" onClick={() => { navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>{copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</button>;
}

function AddAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "James Hermes", role: "Autonomous development and operations lead", department: "Operators" as Agent["department"], provider: "hermes", model: DEFAULT_MODEL.hermes, apiKey: "", endpoint: DEFAULT_ENDPOINT.hermes });
  const [error, setError] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const resetForProvider = (provider: string) => {
    setForm((current) => ({
      ...current,
      provider,
      model: DEFAULT_MODEL[provider] ?? current.model,
      endpoint: DEFAULT_ENDPOINT[provider] ?? current.endpoint,
      name: provider === "hermes" ? "James Hermes" : current.name,
      role: provider === "hermes" ? "Autonomous development and operations lead" : current.role,
      department: provider === "hermes" ? "Operators" : current.department,
      apiKey: provider === "hermes" || provider === "webhook" ? "" : current.apiKey,
    }));
  };

  const close = () => { setError(""); setIsAdding(false); onClose(); };

  const addAgent = async () => {
    if (!form.name.trim() || !form.role.trim()) return setError("Name and role are required.");
    if (["openai", "claude", "openrouter"].includes(form.provider) && !form.apiKey.trim()) return setError("API key is required for this provider.");
    if (["hermes", "webhook"].includes(form.provider) && !form.endpoint.trim()) return setError("Endpoint is required for Hermes or webhook workers.");
    const initials = form.name.trim().split(/\s+/).map((word) => word[0]).join("").toUpperCase().slice(0, 2) || "AG";
    setIsAdding(true);
    setError("");
    try {
      await authedFetch("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          role: form.role.trim(),
          department: form.department,
          isLead: form.provider === "hermes",
          responsibilities: form.provider === "hermes" ? "James Hermes autonomous execution worker connected inside Hostinger." : "Connected AI worker managed by Mission Control.",
          avatarInitials: initials,
          isPluggedIn: true,
          endpoint: form.endpoint.trim() || null,
          provider: form.provider,
          model: form.model.trim() || DEFAULT_MODEL[form.provider] || null,
          apiKey: form.apiKey.trim() || null,
        }),
      });
      await onCreated();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add agent.");
    } finally {
      setIsAdding(false);
    }
  };

  return <Dialog open={open} onOpenChange={(value) => !value && close()}><DialogContent className="max-w-lg bg-card border-border"><DialogHeader><DialogTitle className="mission-dialog-title"><Plus className="h-4 w-4" /> Employ AI worker</DialogTitle></DialogHeader><div className="grid gap-3"><div className="grid gap-1.5"><Label>Name</Label><Input autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="James Hermes" /></div><div className="grid gap-1.5"><Label>Role</Label><Input value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} placeholder="Autonomous development lead" /></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>Department</Label><Select value={form.department} onValueChange={(value) => setForm((current) => ({ ...current, department: value as Agent["department"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DEPARTMENTS.map((department) => <SelectItem key={department} value={department}>{department}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><Label>Provider</Label><Select value={form.provider} onValueChange={resetForProvider}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROVIDERS.map((provider) => <SelectItem key={provider.value} value={provider.value}>{provider.label}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-1.5"><Label>Model</Label><Input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="openai/gpt-4o-mini" /></div>{["openai", "claude", "openrouter"].includes(form.provider) && <div className="grid gap-1.5"><Label>API key</Label><Input type="password" value={form.apiKey} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="Stored encrypted" /></div>}{["hermes", "webhook"].includes(form.provider) && <div className="grid gap-1.5"><Label>Worker endpoint</Label><Input value={form.endpoint} onChange={(event) => setForm((current) => ({ ...current, endpoint: event.target.value }))} placeholder="/api/james/message" /></div>}{error && <p className="text-xs text-destructive">{error}</p>}<div className="flex justify-end gap-2 pt-2"><Button size="sm" variant="outline" onClick={close}>Cancel</Button><Button size="sm" onClick={addAgent} disabled={isAdding}>{isAdding ? "Adding" : "Employ worker"}</Button></div></div></DialogContent></Dialog>;
}

function AgentDetailDialog({ agent, onClose, onChanged }: { agent: Agent | null; onClose: () => void; onChanged: () => void }) {
  const updateAgent = useUpdateAgent();
  const regenerate = useRegenerateAgentToken();
  const [token, setToken] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState("Write a short test report confirming you can complete work from Mission Control.");
  if (!agent) return null;
  const online = isOnline(agent);

  const disconnect = async () => { await updateAgent.mutateAsync({ id: agent.id, data: { isPluggedIn: false, provider: null, model: null, apiKey: null, endpoint: null, status: "idle", currentTask: null } }); onChanged(); onClose(); };
  const refreshToken = async () => { const result = await regenerate.mutateAsync({ id: agent.id }); setToken(result.inboundToken); onChanged(); };
  const testConnection = async () => { setIsTesting(true); setError(null); setMessage(null); try { const result = await authedFetch(`/api/agents/${agent.id}/test`, { method: "POST", body: JSON.stringify({}) }, agent.provider === "hermes" ? 190_000 : 25_000); setMessage(result.output ?? result.result?.output ?? "Connection test passed."); onChanged(); } catch (err) { setError(err instanceof Error ? err.message : "Connection test failed."); } finally { setIsTesting(false); } };
  const runTestTask = async () => { setIsRunning(true); setError(null); setMessage(null); try { const result = await authedFetch(`/api/agents/${agent.id}/test-task`, { method: "POST", body: JSON.stringify({ instructions: brief }) }, agent.provider === "hermes" ? 190_000 : 70_000); setMessage(result.result?.output ?? result.output ?? "Test task completed."); onChanged(); } catch (err) { setError(err instanceof Error ? err.message : "Test task failed."); } finally { setIsRunning(false); } };

  return <Dialog open={Boolean(agent)} onOpenChange={(value) => !value && onClose()}><DialogContent className="max-w-lg bg-card border-border"><DialogHeader><DialogTitle className="agent-detail-head"><AgentPortrait initials={agent.avatarInitials} online={online} /><span><strong>{agent.name}</strong><em>{agent.role}</em></span></DialogTitle></DialogHeader><div className="agent-detail-grid"><div><span>Status</span><strong>{statusLabel(agent)}</strong></div><div><span>Provider</span><strong>{agent.provider ?? "—"}</strong></div><div><span>Model</span><strong>{agent.model ?? "—"}</strong></div><div><span>Key</span><strong>{agent.apiKeyHint ?? (agent.endpoint ? "Endpoint" : "—")}</strong></div></div><div className="grid gap-2 rounded-xl border border-border/70 bg-secondary/20 p-3"><Textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={3} placeholder="Test task brief" /><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={testConnection} disabled={isTesting} className="gap-2"><Wifi className="h-3.5 w-3.5" />{isTesting ? "Testing" : "Test connection"}</Button><Button size="sm" onClick={runTestTask} disabled={isRunning || !brief.trim()} className="gap-2"><Send className="h-3.5 w-3.5" />{isRunning ? "Running" : "Send test work"}</Button><Button size="sm" variant="outline" onClick={refreshToken} disabled={regenerate.isPending} className="gap-2"><KeyRound className="h-3.5 w-3.5" />{regenerate.isPending ? "Generating" : "Agent token"}</Button><Button size="sm" variant="ghost" onClick={disconnect} disabled={updateAgent.isPending} className="gap-2 text-red-400 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" />Disconnect</Button></div></div>{message && <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-200"><CheckCircle2 className="mr-2 inline h-4 w-4" />{message}</div>}{error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}{(token || agent.endpoint) && <div className="agent-token-box">{agent.endpoint && <p><span>Endpoint</span>{agent.endpoint}</p>}{token && <div><span>Token ready</span><CopyButton value={token} /></div>}</div>}</DialogContent></Dialog>;
}

export default function Team() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const { data: agents = [], isLoading } = useListAgents();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
  const onlineCount = agents.filter((agent) => isOnline(agent)).length;

  return <div className="workspaces-shell h-full overflow-y-auto"><div className="workspaces-canvas space-y-4"><header className="team-directory-hero workspace-panel"><div><span className="dashboard-topline"><Users className="h-3.5 w-3.5" /> AI workers</span><h1 className="mission-page-title">AI Team</h1></div><div className="team-hero-stats"><span><strong>{agents.length}</strong> workers</span><span><strong>{onlineCount}</strong> online</span></div><Button size="sm" onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-3.5 w-3.5" /> Employ worker</Button></header><section className="agent-directory-grid">{isLoading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-56 rounded-2xl" />) : <>{agents.map((agent) => <AgentDirectoryCard key={`${agent.id}-${agent.name}`} agent={agent} onOpen={() => setSelectedAgent(agent)} />)}<button type="button" className="agent-directory-card agent-add-card" onClick={() => setShowAdd(true)}><div className="agent-add-icon"><Plus className="h-7 w-7" /></div><div className="agent-card-copy"><h3>Employ your first AI worker</h3><p>Connect James Hermes, OpenRouter, Claude, OpenAI or a webhook.</p></div><span className="agent-status-pill">Ready</span></button></>}</section></div><AddAgentDialog open={showAdd} onClose={() => setShowAdd(false)} onCreated={invalidate} /><AgentDetailDialog agent={selectedAgent} onClose={() => setSelectedAgent(null)} onChanged={invalidate} /></div>;
}
