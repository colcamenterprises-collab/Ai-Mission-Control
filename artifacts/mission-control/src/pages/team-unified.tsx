import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, MessageCircle, Plus, Send, Settings2, Sparkles, Wifi } from "lucide-react";
import { getListAgentsQueryKey, useListAgents, type Agent } from "@workspace/api-client-react";
import AgentCreation from "@/pages/agent-creation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import "./team-unified.css";

const PRIMARY_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_STORAGE_KEY = "missionControlAdminToken";
const CHAT_HISTORY_PREFIX = "mission_control_agent_chat";

type EmployeeProfile = {
  agentId: number;
  projectId?: number | null;
  projectName?: string | null;
  avatarUrl?: string | null;
};

type ChatEntry = {
  id: string;
  role: "owner" | "agent" | "system";
  text: string;
  taskId?: number;
};

type RuntimeResult = {
  output?: string | null;
  error?: string | null;
  taskId?: number;
  result?: { output?: string | null; error?: string | null };
};

type AgentWithSkills = Agent & { assignedSkills?: string[] };

function getAdminToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PRIMARY_TOKEN_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) ?? "";
}

async function authedFetch<T>(path: string, init?: RequestInit, timeoutMs = 70_000): Promise<T> {
  const token = getAdminToken();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    const text = await response.text();
    const payload = text.trim() ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(payload.error ?? payload.result?.error ?? `${response.status} ${response.statusText}`);
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("The agent did not respond before the request timed out.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function statusLabel(agent: Agent) {
  if (agent.status === "active") return "Working";
  if (agent.status === "pending") return "Starting";
  if (agent.status === "error") return "Needs attention";
  return "Ready";
}

function initials(agent: Agent) {
  return agent.avatarInitials || agent.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function description(agent: Agent) {
  const source = agent.responsibilities?.trim() || `${agent.role} supporting the ${agent.department} function.`;
  const sentence = source.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || source;
  return sentence.length > 140 ? `${sentence.slice(0, 137).trimEnd()}…` : sentence;
}

function formatLastSeen(value?: string | null) {
  if (!value) return "Not yet recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function chatStorageKey(agentId: number) {
  return `${CHAT_HISTORY_PREFIX}:${agentId}`;
}

function loadChatHistory(agentId: number): ChatEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(chatStorageKey(agentId));
    const parsed = raw ? JSON.parse(raw) as ChatEntry[] : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry.text?.trim()).slice(-20) : [];
  } catch {
    return [];
  }
}

function saveChatHistory(agentId: number, entries: ChatEntry[]) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(chatStorageKey(agentId), JSON.stringify(entries.slice(-20))); } catch { /* chat remains available in memory */ }
}

function AgentModal({ agent, mode, onClose, onChanged }: { agent: Agent | null; mode: "manage" | "chat"; onClose: () => void; onChanged: () => void }) {
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [brief, setBrief] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!agent) return;
    setChat(loadChatHistory(agent.id));
    setError("");
    if (mode === "chat") window.setTimeout(() => composerRef.current?.focus(), 80);
  }, [agent?.id, mode]);

  if (!agent) return null;
  const skills = (agent as AgentWithSkills).assignedSkills ?? [];

  const appendChat = (entry: Omit<ChatEntry, "id">) => {
    setChat((current) => {
      const next = [...current, { id: `${Date.now()}-${current.length}`, ...entry }].slice(-20);
      saveChatHistory(agent.id, next);
      return next;
    });
  };

  const checkConnection = async () => {
    setChecking(true); setError("");
    try {
      const result = await authedFetch<RuntimeResult>(`/api/agents/${agent.id}/test`, { method: "POST", body: "{}" }, agent.provider === "hermes" ? 190_000 : 30_000);
      const output = result.result?.output?.trim() || result.output?.trim() || "Connection check passed.";
      appendChat({ role: "system", text: output });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection check failed.");
    } finally { setChecking(false); }
  };

  const sendChat = async () => {
    const instructions = brief.trim();
    if (!instructions) return;
    appendChat({ role: "owner", text: instructions });
    setBrief(""); setSending(true); setError("");
    try {
      const result = await authedFetch<RuntimeResult>(`/api/agents/${agent.id}/test-task`, { method: "POST", body: JSON.stringify({ instructions }) }, agent.provider === "hermes" ? 190_000 : 90_000);
      const output = result.result?.output?.trim() || result.output?.trim() || "The request was completed.";
      appendChat({ role: "agent", text: output, taskId: result.taskId });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The message could not be completed.");
    } finally { setSending(false); }
  };

  return (
    <Dialog open={Boolean(agent)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="team-agent-modal">
        <DialogHeader>
          <DialogTitle className="team-modal-title">
            <span className={`team-modal-live-dot status-${agent.status}`} />
            <span><strong>{agent.name}</strong><em>{statusLabel(agent)} · {agent.role}</em></span>
          </DialogTitle>
        </DialogHeader>

        <div className="team-agent-summary-grid">
          <div><span>Department</span><strong>{agent.department}</strong></div>
          <div><span>Provider</span><strong>{agent.provider || "Not connected"}</strong></div>
          <div><span>Model</span><strong>{agent.model || "Default"}</strong></div>
          <div><span>Current work</span><strong>{agent.currentTask || "Available"}</strong></div>
          <div><span>Completed</span><strong>{agent.tasksCompleted ?? 0} tasks</strong></div>
          <div><span>Last response</span><strong>{formatLastSeen(agent.lastPing)}</strong></div>
        </div>

        <div className="team-agent-responsibility">
          <span>What this employee is responsible for</span>
          <p>{agent.responsibilities || description(agent)}</p>
        </div>

        <div className="team-agent-skill-row">
          <span>Assigned skills</span>
          <div>{skills.length ? skills.map((skill) => <b key={skill}>{skill}</b>) : <em>No specific skills assigned yet</em>}</div>
          <Button size="sm" variant="outline" onClick={checkConnection} disabled={checking}><Wifi className="h-3.5 w-3.5" /> {checking ? "Checking" : "Check connection"}</Button>
        </div>

        <section className={`team-mini-chat ${mode === "chat" ? "team-mini-chat-focus" : ""}`}>
          <div className="team-mini-chat-head"><MessageCircle className="h-4 w-4" /><strong>Direct chat with {agent.name}</strong></div>
          <div className="team-mini-chat-log">
            {chat.length ? chat.map((entry) => (
              <div key={entry.id} className={`team-mini-bubble ${entry.role}`}>
                <p>{entry.text}</p>
                {entry.taskId && <small>Task #{entry.taskId}</small>}
              </div>
            )) : <div className="team-mini-chat-empty">Send a message or instruction directly to this employee.</div>}
          </div>
          {error && <div className="team-mini-chat-error">{error}</div>}
          <div className="team-mini-chat-composer">
            <Textarea ref={composerRef} value={brief} onChange={(event) => setBrief(event.target.value)} rows={2} placeholder={`Message ${agent.name}…`} />
            <Button size="sm" onClick={sendChat} disabled={sending || !brief.trim()}><Send className="h-3.5 w-3.5" /> {sending ? "Sending" : "Send"}</Button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamUnified() {
  const queryClient = useQueryClient();
  const { data: agents = [], isLoading } = useListAgents();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<"manage" | "chat">("manage");
  const initialHireMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("hire") === "1";
  const [hireOpen, setHireOpen] = useState(initialHireMode);

  useEffect(() => {
    fetch("/api/employee-factory/profiles", { headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : [])
      .then((rows) => setProfiles(Array.isArray(rows) ? rows : []))
      .catch(() => setProfiles([]));
  }, [agents.length]);

  const profileByAgent = useMemo(() => new Map(profiles.map((profile) => [profile.agentId, profile])), [profiles]);
  const selectedAgent = selectedAgentId ? agents.find((agent) => agent.id === selectedAgentId) ?? null : null;
  const refreshAgents = () => { void queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() }); };

  const openAgent = (agentId: number, mode: "manage" | "chat") => {
    setSelectedAgentId(agentId);
    setModalMode(mode);
  };

  const closeHire = () => {
    setHireOpen(false);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("hire")) window.history.replaceState({}, "", "/team");
  };

  return (
    <div className="team-unified-shell">
      <div className="team-unified-canvas">
        <header className="team-unified-header">
          <div>
            <span className="team-unified-eyebrow"><Sparkles aria-hidden="true" /> AI Team</span>
            <h1>Your AI employees</h1>
            <p className="team-unified-subtitle">Your active AI workforce, their responsibilities, status and direct controls.</p>
          </div>
        </header>

        <section className="team-employee-grid" aria-label="AI employees">
          {isLoading ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="team-glass-card team-glass-skeleton" />) : (
            <>
              {agents.map((agent) => {
                const profile = profileByAgent.get(agent.id);
                return (
                  <article key={agent.id} className="team-glass-card team-agent-card">
                    <div className="team-avatar-wrap">
                      {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" className="team-agent-photo" /> : <div className="team-agent-initials">{initials(agent)}</div>}
                      <span className={`team-live-dot ${agent.status === "active" ? "online" : ""}`} />
                    </div>
                    <div className="team-card-identity">
                      <strong>{agent.name}</strong>
                      <span className="team-card-role">{agent.role}</span>
                      <p>{description(agent)}</p>
                    </div>
                    <span className={`team-card-status status-${agent.status}`}>{statusLabel(agent)}</span>
                    <div className="team-card-actions">
                      <button type="button" onClick={() => openAgent(agent.id, "manage")}><Settings2 aria-hidden="true" /> Manage</button>
                      <button type="button" onClick={() => openAgent(agent.id, "chat")}><MessageCircle aria-hidden="true" /> Chat</button>
                    </div>
                  </article>
                );
              })}

              <button type="button" className="team-glass-card team-hire-card" onClick={() => setHireOpen(true)}>
                <span className="team-hire-icon"><Plus aria-hidden="true" /></span>
                <div className="team-card-identity">
                  <strong>Hire AI Employee</strong>
                  <p>Add another specialist to your workforce and connect their runtime, project and approved AI account.</p>
                </div>
              </button>
            </>
          )}
        </section>
      </div>

      <AgentModal agent={selectedAgent} mode={modalMode} onClose={() => setSelectedAgentId(null)} onChanged={refreshAgents} />

      <Dialog open={hireOpen} onOpenChange={(open) => !open && closeHire()}>
        <DialogContent className="team-hire-dialog">
          <DialogHeader><DialogTitle><span className="team-unified-eyebrow"><Bot className="h-4 w-4" /> Hire AI Employee</span></DialogTitle></DialogHeader>
          <div className="team-hire-dialog-body"><AgentCreation /></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
