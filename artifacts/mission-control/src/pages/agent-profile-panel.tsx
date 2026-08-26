import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, BookOpen, Brain, Download, KeyRound, MessageCircle, Save, Send, ShieldCheck, Sparkles, UserRound, Wifi, Wrench } from "lucide-react";
import { type Agent } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import "./agent-profile-panel.css";

const PRIMARY_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_STORAGE_KEY = "missionControlAdminToken";
const CHAT_HISTORY_PREFIX = "mission_control_agent_chat";

type Profile = {
  identity: { mission: string; successDefinition: string };
  soul: { communicationStyle: string; decisionStyle: string; initiative: string; challengeOwner: string; principles: string; neverDo: string };
  operating: { autonomy: string; approvalRequired: string; completionStandard: string; reportingStyle: string };
  user: { managerName: string; communicationPreferences: string; escalationRules: string };
  tools: { allowedTools: string; accessRules: string };
  heartbeat: { recurringDuties: string; alertConditions: string };
  memory: { seed: string };
};

type DefinitionResponse = {
  profile: Profile;
  completeness: number;
  projectName?: string | null;
  workspaceConnected: boolean;
  runtimeType?: string | null;
  runtimeHealth?: string | null;
  generatedFiles: Record<string, string>;
  version: number;
};

type ChatEntry = { id: string; role: "owner" | "agent"; text: string; taskId?: number };
type AgentWithSkills = Agent & { assignedSkills?: string[] };
type Tab = "overview" | "identity" | "skills" | "memory" | "knowledge" | "tools" | "activity" | "chat" | "export";

const emptyProfile: Profile = {
  identity: { mission: "", successDefinition: "" },
  soul: { communicationStyle: "", decisionStyle: "", initiative: "", challengeOwner: "", principles: "", neverDo: "" },
  operating: { autonomy: "", approvalRequired: "", completionStandard: "", reportingStyle: "" },
  user: { managerName: "", communicationPreferences: "", escalationRules: "" },
  tools: { allowedTools: "", accessRules: "" },
  heartbeat: { recurringDuties: "", alertConditions: "" },
  memory: { seed: "" },
};

function getAdminToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PRIMARY_TOKEN_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) ?? "";
}

async function authedFetch<T>(path: string, init?: RequestInit, timeoutMs = 90_000): Promise<T> {
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
    let payload: unknown = {};
    try { payload = text.trim() ? JSON.parse(text) : {}; } catch { payload = text; }
    if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload ? String((payload as { error?: unknown }).error) : `${response.status} ${response.statusText}`);
    return payload as T;
  } finally { window.clearTimeout(timeout); }
}

function firstVisibleText(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if ((trimmed.startsWith("{") || trimmed.startsWith("["))) {
      try { return firstVisibleText(JSON.parse(trimmed)); } catch { return trimmed; }
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    for (const item of value) { const text = firstVisibleText(item); if (text) return text; }
    return "";
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const priority = [record.finalAssistantVisibleText, record.output, record.text, record.final, record.payloads, record.result];
    for (const candidate of priority) { const text = firstVisibleText(candidate); if (text) return text; }
  }
  return "";
}

function statusLabel(agent: Agent) {
  if (agent.status === "active") return "Working";
  if (agent.status === "pending") return "Starting";
  if (agent.status === "error") return "Needs attention";
  return "Ready";
}

function formatLastSeen(value?: string | null) {
  if (!value) return "Not yet recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function loadChat(agentId: number): ChatEntry[] {
  try { return JSON.parse(window.sessionStorage.getItem(`${CHAT_HISTORY_PREFIX}:${agentId}`) || "[]") as ChatEntry[]; } catch { return []; }
}

function saveChat(agentId: number, entries: ChatEntry[]) {
  try { window.sessionStorage.setItem(`${CHAT_HISTORY_PREFIX}:${agentId}`, JSON.stringify(entries.slice(-20))); } catch {}
}

function Question({ label, hint, value, onChange, rows = 3 }: { label: string; hint: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return <label className="agent-question"><strong>{label}</strong><span>{hint}</span><Textarea rows={rows} value={value} onChange={event => onChange(event.target.value)} /></label>;
}

export default function AgentProfilePanel({ agent, initialMode = "manage", onChanged }: { agent: Agent; initialMode?: "manage" | "chat"; onChanged?: () => void }) {
  const [tab, setTab] = useState<Tab>(initialMode === "chat" ? "chat" : "overview");
  const [definition, setDefinition] = useState<DefinitionResponse | null>(null);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [health, setHealth] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [brief, setBrief] = useState("");
  const [sending, setSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const skills = (agent as AgentWithSkills).assignedSkills ?? [];

  const load = async () => {
    setLoading(true); setError("");
    try {
      const data = await authedFetch<DefinitionResponse>(`/api/employee-factory/agents/${agent.id}/definition`);
      setDefinition(data); setProfile(data.profile);
    } catch (err) { setError(err instanceof Error ? err.message : "Agent profile could not be loaded."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); setChat(loadChat(agent.id)); setTab(initialMode === "chat" ? "chat" : "overview"); }, [agent.id, initialMode]);
  useEffect(() => { if (tab === "chat") window.setTimeout(() => composerRef.current?.focus(), 50); }, [tab]);

  const patch = <S extends keyof Profile, K extends keyof Profile[S]>(section: S, key: K, value: string) => setProfile(current => ({ ...current, [section]: { ...current[section], [key]: value } }));

  const save = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await authedFetch<DefinitionResponse & { workspaceSynced?: boolean }>(`/api/employee-factory/agents/${agent.id}/definition`, { method: "PUT", body: JSON.stringify({ profile }) });
      setDefinition(current => current ? { ...current, ...result } : result);
      setMessage(result.workspaceSynced ? "Profile saved and Markdown files synced to the live agent workspace." : "Profile saved. This employee has no managed runtime workspace to sync yet.");
      onChanged?.();
    } catch (err) { setError(err instanceof Error ? err.message : "Agent profile could not be saved."); }
    finally { setSaving(false); }
  };

  const checkConnection = async () => {
    setChecking(true); setError(""); setHealth(null);
    try {
      const raw = await authedFetch<unknown>(`/api/agents/${agent.id}/test`, { method: "POST", body: "{}" }, agent.provider === "hermes" ? 190_000 : 45_000);
      const text = firstVisibleText(raw) || "Connection check passed.";
      setHealth({ ok: true, text }); onChanged?.();
    } catch (err) { setHealth({ ok: false, text: err instanceof Error ? err.message : "Connection check failed." }); }
    finally { setChecking(false); }
  };

  const sendChat = async () => {
    const instructions = brief.trim();
    if (!instructions) return;
    const owner: ChatEntry = { id: `${Date.now()}-o`, role: "owner", text: instructions };
    const next = [...chat, owner]; setChat(next); saveChat(agent.id, next); setBrief(""); setSending(true); setError("");
    try {
      const raw = await authedFetch<unknown>(`/api/agents/${agent.id}/test-task`, { method: "POST", body: JSON.stringify({ instructions }) }, agent.provider === "hermes" ? 190_000 : 120_000);
      const text = firstVisibleText(raw) || "The request completed without a user-visible response.";
      const taskId = typeof raw === "object" && raw && "taskId" in raw ? Number((raw as { taskId?: unknown }).taskId) || undefined : undefined;
      const updated = [...next, { id: `${Date.now()}-a`, role: "agent" as const, text, taskId }]; setChat(updated); saveChat(agent.id, updated); onChanged?.();
    } catch (err) { setError(err instanceof Error ? err.message : "The message could not be completed."); }
    finally { setSending(false); }
  };

  const tabs = useMemo(() => [
    ["overview", "Overview", UserRound], ["identity", "Identity & Soul", Sparkles], ["skills", "Skills", ShieldCheck], ["memory", "Memory", Brain],
    ["knowledge", "Knowledge", BookOpen], ["tools", "Tools & Access", Wrench], ["activity", "Activity", Activity],
    ["chat", "Chat", MessageCircle], ["export", "Export", Download],
  ] as const, []);

  const exportAgent = async () => {
    const token = getAdminToken();
    const response = await fetch(`/api/employee-factory/agents/${agent.id}/export`, { headers: token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {} });
    if (!response.ok) { setError("Agent export could not be generated."); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a");
    const disposition = response.headers.get("content-disposition") || ""; const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `${agent.name.toLowerCase().replace(/\W+/g, "-")}.agent.json`;
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="agent-profile-loading">Loading employee profile…</div>;

  return <div className="agent-profile-panel">
    <div className="agent-profile-tabs">{tabs.map(([id, label, Icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon />{label}</button>)}</div>
    {definition && <div className="agent-profile-progress"><span>Profile completeness</span><div><i style={{ width: `${definition.completeness}%` }} /></div><strong>{definition.completeness}%</strong></div>}
    {message && <div className="agent-profile-notice success">{message}</div>}
    {error && <div className="agent-profile-notice error">{error}</div>}

    <div className="agent-profile-content">
      {tab === "overview" && <>
        <div className="agent-profile-summary-grid">
          <div><span>Status</span><strong>{statusLabel(agent)}</strong></div><div><span>Department</span><strong>{agent.department}</strong></div><div><span>Project</span><strong>{definition?.projectName || "Not assigned"}</strong></div>
          <div><span>Provider</span><strong>{agent.provider || "Not connected"}</strong></div><div><span>Model</span><strong>{agent.model || "Default"}</strong></div><div><span>Workspace</span><strong>{definition?.workspaceConnected ? "Connected" : "Not managed"}</strong></div>
          <div><span>Current work</span><strong>{agent.currentTask || "Available"}</strong></div><div><span>Completed</span><strong>{agent.tasksCompleted ?? 0} tasks</strong></div><div><span>Last response</span><strong>{formatLastSeen(agent.lastPing)}</strong></div>
        </div>
        <section className="agent-profile-card"><h3>Role and responsibility</h3><p>{agent.responsibilities || agent.role}</p></section>
        <section className="agent-profile-card health"><div><h3>Agent health</h3><p>Administrative runtime check. Results stay here and do not pollute the employee chat.</p></div><Button variant="outline" onClick={checkConnection} disabled={checking}><Wifi />{checking ? "Checking" : "Check connection"}</Button></section>
        {health && <div className={`agent-health-result ${health.ok ? "ok" : "bad"}`}><strong>{health.ok ? "Connected" : "Connection failed"}</strong><p>{health.text}</p></div>}
      </>}

      {tab === "identity" && <div className="agent-question-grid">
        <Question label="What is this employee's mission?" hint="One clear statement describing why this employee exists." value={profile.identity.mission} onChange={v => patch("identity", "mission", v)} />
        <Question label="What does success look like?" hint="How should Mission Control know this employee is doing an excellent job?" value={profile.identity.successDefinition} onChange={v => patch("identity", "successDefinition", v)} />
        <Question label="How should they communicate?" hint="Tone, level of detail, directness and how they should explain problems." value={profile.soul.communicationStyle} onChange={v => patch("soul", "communicationStyle", v)} />
        <Question label="How should they make decisions?" hint="For example: data-first, conservative, commercial, customer-first or speed-first." value={profile.soul.decisionStyle} onChange={v => patch("soul", "decisionStyle", v)} />
        <Question label="How proactive should they be?" hint="Describe when they should act independently rather than wait for instructions." value={profile.soul.initiative} onChange={v => patch("soul", "initiative", v)} />
        <Question label="When should they challenge you?" hint="Define when the employee should disagree, warn you or propose a better approach." value={profile.soul.challengeOwner} onChange={v => patch("soul", "challengeOwner", v)} />
        <Question label="What principles guide them?" hint="The values and judgement rules that should remain stable across tasks." value={profile.soul.principles} onChange={v => patch("soul", "principles", v)} />
        <Question label="What must they never do?" hint="Hard behavioural boundaries specific to this employee." value={profile.soul.neverDo} onChange={v => patch("soul", "neverDo", v)} />
        <Question label="What can they do without approval?" hint="Define their autonomous authority." value={profile.operating.autonomy} onChange={v => patch("operating", "autonomy", v)} />
        <Question label="What always requires approval?" hint="Financial, destructive, customer-facing, production or other owner-level decisions." value={profile.operating.approvalRequired} onChange={v => patch("operating", "approvalRequired", v)} />
        <Question label="When is work actually complete?" hint="Evidence, verification and handoff requirements before claiming completion." value={profile.operating.completionStandard} onChange={v => patch("operating", "completionStandard", v)} />
        <Question label="How should results be reported?" hint="Preferred format for updates, blockers, recommendations and completed work." value={profile.operating.reportingStyle} onChange={v => patch("operating", "reportingStyle", v)} />
        <Question label="Who is their primary manager?" hint="The person whose instructions and preferences this employee primarily serves." value={profile.user.managerName} onChange={v => patch("user", "managerName", v)} />
        <Question label="How does that manager prefer to work?" hint="Communication preferences, decision style and important working conventions." value={profile.user.communicationPreferences} onChange={v => patch("user", "communicationPreferences", v)} />
        <Question label="When should they escalate?" hint="Specific conditions that should trigger owner attention." value={profile.user.escalationRules} onChange={v => patch("user", "escalationRules", v)} />
      </div>}

      {tab === "skills" && <><section className="agent-profile-card"><h3>Assigned Mission Control skills</h3><div className="agent-chip-row">{skills.length ? skills.map(skill => <b key={skill}>{skill}</b>) : <em>No Mission Control skills assigned yet.</em>}</div><p>These are explicit job permissions. They are separate from capabilities that happen to exist inside the underlying runtime.</p></section><section className="agent-profile-card"><h3>Runtime capabilities</h3><p>Runtime-installed capabilities are infrastructure, not permission. Mission Control should only delegate work requiring capabilities this employee has explicitly been assigned.</p></section></>}

      {tab === "memory" && <Question label="Agent-specific memory seed" hint="Durable knowledge unique to this employee. Shared company knowledge should remain in the central Knowledge library." value={profile.memory.seed} onChange={v => patch("memory", "seed", v)} rows={12} />}

      {tab === "knowledge" && <><section className="agent-profile-card"><h3>Shared knowledge library</h3><p>This employee belongs to {definition?.projectName || "an unassigned project"}. Product knowledge, standards, playbooks and company facts stay centrally managed and are attached by reference rather than copied into the employee.</p></section><section className="agent-profile-card"><h3>Generated agent documents</h3><div className="agent-chip-row">{Object.keys(definition?.generatedFiles || {}).map(file => <b key={file}>{file}</b>)}</div></section></>}

      {tab === "tools" && <div className="agent-question-grid"><Question label="What tools and systems may this employee use?" hint="Name approved systems, capabilities and tool categories. Do not enter passwords or API keys." value={profile.tools.allowedTools} onChange={v => patch("tools", "allowedTools", v)} /><Question label="What are the access rules?" hint="Read/write boundaries, production restrictions and credential-use rules." value={profile.tools.accessRules} onChange={v => patch("tools", "accessRules", v)} /><section className="agent-profile-card security"><KeyRound/><div><h3>Credentials stay in the vault</h3><p>Agent files contain permission references only. Secret values are never written into the portable employee profile.</p></div></section></div>}

      {tab === "activity" && <div className="agent-profile-summary-grid"><div><span>Tasks completed</span><strong>{agent.tasksCompleted ?? 0}</strong></div><div><span>Success rate</span><strong>{agent.successRate ?? 0}%</strong></div><div><span>Current work</span><strong>{agent.currentTask || "Available"}</strong></div><div><span>Last response</span><strong>{formatLastSeen(agent.lastPing)}</strong></div><div><span>Runtime health</span><strong>{definition?.runtimeHealth || "Unknown"}</strong></div><div><span>Profile version</span><strong>v{definition?.version ?? 1}</strong></div></div>}

      {tab === "chat" && <section className="agent-direct-chat"><div className="agent-chat-log">{chat.length ? chat.map(entry => <div key={entry.id} className={`agent-chat-bubble ${entry.role}`}><p>{entry.text}</p>{entry.taskId && <small>Task #{entry.taskId}</small>}</div>) : <div className="agent-chat-empty">Send a message or instruction directly to {agent.name}.</div>}</div><div className="agent-chat-composer"><Textarea ref={composerRef} rows={3} value={brief} onChange={event => setBrief(event.target.value)} placeholder={`Message ${agent.name}…`} /><Button onClick={sendChat} disabled={sending || !brief.trim()}><Send />{sending ? "Sending" : "Send"}</Button></div></section>}

      {tab === "export" && <section className="agent-profile-card export"><Download/><div><h3>Portable Agent Package</h3><p>Export this employee's structured profile, generated Markdown files and dependency manifest. Credentials and secret values are intentionally excluded.</p><Button onClick={exportAgent}><Download/>Export {agent.name}</Button></div></section>}
    </div>

    {["identity", "memory", "tools"].includes(tab) && <div className="agent-profile-save"><Button onClick={save} disabled={saving}><Save />{saving ? "Saving" : "Save & sync agent"}</Button></div>}
  </div>;
}
