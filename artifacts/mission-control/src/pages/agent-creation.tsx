import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Cpu,
  ImagePlus,
  KeyRound,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import "./employee-factory.css";

const PRIMARY_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_STORAGE_KEY = "missionControlAdminToken";
const AVATAR_MAX_EDGE = 512;
const AVATAR_WEBP_QUALITY = 0.82;

type RuntimeHost = { id: number; name: string; runtimeType: string; status: string };
type SecretRef = { id: number; name: string; provider?: string | null; valueHint?: string | null; status: string };
type EmployeeTemplate = { id: number; name: string; runtimeType: string; model?: string | null };
type RuntimeInstance = { id: number; agentId: number; runtimeHostId?: number | null; runtimeType: string; status: string; health: string; lastError?: string | null };
type AgentSummary = { id: number; name: string; role: string; department: string; status: string; isPluggedIn: boolean };
type Overview = { hosts: RuntimeHost[]; secrets: SecretRef[]; templates: EmployeeTemplate[]; instances: RuntimeInstance[]; agents: AgentSummary[] };
type Project = { id: number; name: string; description?: string | null };
type EmployeeProfile = { agentId: number; projectId?: number | null; projectName?: string | null; avatarUrl?: string | null };
type RuntimeChoice = "openclaw" | "hermes" | "existing";
type HireStatus = { state: "idle" | "working" | "ready" | "error"; message: string };
type AvatarStatus = { state: "idle" | "uploading" | "ready" | "error"; message: string };

function getAdminToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PRIMARY_TOKEN_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) ?? "";
}

async function authedFetch<T>(path: string, init?: RequestInit, timeoutMs = 210_000): Promise<T> {
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
    let payload: Record<string, unknown> = {};
    try { payload = text.trim() ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `${response.status} ${response.statusText}`);
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Mission Control did not finish hiring within the expected time. No employee should be assumed created until Mission Control confirms it.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function uploadAvatarBinary(blob: Blob): Promise<{ avatarUrl: string }> {
  const token = getAdminToken();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch("/api/employee-factory/avatar", {
      method: "POST",
      body: blob,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": blob.type || "image/webp",
        ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
      },
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try { payload = text.trim() ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `${response.status} ${response.statusText}`);
    if (typeof payload.avatarUrl !== "string") throw new Error("Mission Control did not return the saved photo location.");
    return { avatarUrl: payload.avatarUrl };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Employee photo upload timed out. Try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function resizeAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the employee photo.");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", AVATAR_WEBP_QUALITY));
    if (!blob) throw new Error("This browser could not compress the employee photo.");
    return blob;
  } finally {
    bitmap.close();
  }
}

function friendlyHealth(value: string) {
  if (["healthy", "online", "ready"].includes(value.toLowerCase())) return "Ready";
  if (["paused", "stopped"].includes(value.toLowerCase())) return "Paused";
  if (["error", "unhealthy", "failed"].includes(value.toLowerCase())) return "Needs attention";
  return value || "Checking";
}

export default function AgentCreation() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hireStatus, setHireStatus] = useState<HireStatus>({ state: "idle", message: "" });
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus>({ state: "idle", message: "" });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [runtimeChoice, setRuntimeChoice] = useState<RuntimeChoice>("openclaw");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [secretForm, setSecretForm] = useState({ name: "Company OpenRouter", provider: "openrouter", value: "" });
  const [form, setForm] = useState({
    name: "",
    role: "",
    department: "",
    projectId: "",
    owner: "",
    responsibilities: "",
    runtimeHostId: "",
    templateId: "",
    secretId: "",
    model: "openrouter/auto",
  });

  const load = async (options?: { preserveMessages?: boolean }) => {
    setLoading(true);
    if (!options?.preserveMessages) setError("");
    try {
      const [data, projectRows, profileRows] = await Promise.all([
        authedFetch<Overview>("/api/provisioning/overview", { method: "GET" }, 30_000),
        authedFetch<Project[]>("/api/employee-factory/projects", { method: "GET" }, 30_000),
        authedFetch<EmployeeProfile[]>("/api/employee-factory/profiles", { method: "GET" }, 30_000),
      ]);
      setOverview(data); setProjects(projectRows); setProfiles(profileRows);
      const openclawHost = data.hosts.find(host => host.runtimeType === "openclaw");
      const openclawTemplate = data.templates.find(template => template.runtimeType === "openclaw");
      const openrouter = data.secrets.find(secret => secret.provider === "openrouter" && secret.status === "active");
      setForm(current => ({
        ...current,
        runtimeHostId: current.runtimeHostId || String(openclawHost?.id ?? ""),
        templateId: current.templateId || String(openclawTemplate?.id ?? ""),
        secretId: current.secretId || String(openrouter?.id ?? ""),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission Control could not load the hiring setup.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const employeeRows = useMemo(() => overview?.instances.map(instance => ({ ...instance, agent: overview.agents.find(agent => agent.id === instance.agentId), profile: profiles.find(profile => profile.agentId === instance.agentId) })) ?? [], [overview, profiles]);
  const selectedProject = projects.find(project => String(project.id) === form.projectId);
  const selectedAccount = overview?.secrets.find(secret => String(secret.id) === form.secretId);
  const openclawHost = overview?.hosts.find(host => host.runtimeType === "openclaw");
  const openclawTemplate = overview?.templates.find(template => template.runtimeType === "openclaw");

  const setHireError = (message: string) => {
    setError(message);
    setHireStatus({ state: "error", message });
  };

  const chooseRuntime = (choice: RuntimeChoice) => {
    setRuntimeChoice(choice);
    setHireStatus({ state: "idle", message: "" });
    if (choice === "openclaw") {
      setForm(current => ({ ...current, runtimeHostId: String(openclawHost?.id ?? ""), templateId: String(openclawTemplate?.id ?? ""), model: openclawTemplate?.model || "openrouter/auto" }));
    }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"].includes(file.type))) {
      setAvatarStatus({ state: "error", message: "Use a PNG, JPG or WebP employee photo." });
      return;
    }
    setAvatarStatus({ state: "uploading", message: "Preparing and uploading photo…" });
    setAvatarUrl("");
    try {
      const resized = await resizeAvatar(file);
      if (resized.size > 512_000) throw new Error("The resized employee photo is still too large. Choose a simpler or smaller image.");
      const previewReader = new FileReader();
      previewReader.onload = () => setAvatarPreview(String(previewReader.result || ""));
      previewReader.readAsDataURL(resized);
      const uploaded = await uploadAvatarBinary(resized);
      setAvatarUrl(uploaded.avatarUrl);
      setAvatarStatus({ state: "ready", message: "Photo ready. It will be attached when this employee is hired." });
      setError("");
    } catch (err) {
      setAvatarPreview("");
      setAvatarUrl("");
      setAvatarStatus({ state: "error", message: err instanceof Error ? err.message : "Mission Control could not upload the employee photo. You can retry or hire without one." });
    }
  };

  const saveAccount = async () => {
    if (!secretForm.name.trim() || !secretForm.value.trim()) return setError("Give this AI account a name and enter the API key.");
    setBusy(true); setError(""); setSuccess("");
    try {
      const secret = await authedFetch<SecretRef>("/api/provisioning/secrets", { method: "POST", body: JSON.stringify({ name: secretForm.name, provider: secretForm.provider, kind: "api_key", value: secretForm.value }) }, 30_000);
      setSecretForm(current => ({ ...current, value: "" })); setForm(current => ({ ...current, secretId: String(secret.id) })); setAddAccountOpen(false);
      setSuccess(`${secret.name} is saved securely and ready to use.`); await load({ preserveMessages: true });
    } catch (err) { setError(err instanceof Error ? err.message : "Mission Control could not save this AI account."); }
    finally { setBusy(false); }
  };

  const hireEmployee = async () => {
    setSuccess("");
    setError("");
    setHireStatus({ state: "idle", message: "" });
    if (!form.name.trim() || !form.role.trim()) return setHireError("Add the employee's name and job title first.");
    if (!form.projectId) return setHireError("Choose the project this employee belongs to.");
    if (runtimeChoice !== "openclaw") return setHireError("Automatic hiring is currently available for OpenClaw. Hermes and existing-agent connection are not one-click ready yet.");
    if (!form.runtimeHostId) return setHireError("Mission Control does not have an OpenClaw worker location ready yet.");
    if (!form.secretId) return setHireError("Choose an AI account for this employee, or add one securely.");
    if (avatarStatus.state === "uploading") return setHireError("Wait for the employee photo to finish uploading, or remove it and continue without a photo.");

    const employeeName = form.name.trim();
    setBusy(true);
    setHireStatus({ state: "working", message: `Hiring ${employeeName}. Mission Control is creating the employee, setting up OpenClaw, connecting the AI account and running its connection check. Keep this page open until you see Ready or an error.` });
    try {
      const result = await authedFetch<{ agent: AgentSummary; instance: RuntimeInstance }>("/api/employee-factory/hire", {
        method: "POST",
        body: JSON.stringify({ ...form, projectId: Number(form.projectId), runtimeHostId: Number(form.runtimeHostId), templateId: form.templateId ? Number(form.templateId) : null, secretId: Number(form.secretId), runtimeType: runtimeChoice, avatarUrl: avatarUrl || null }),
      });
      const readyMessage = `${result.agent.name} is hired and connected. Opening AI Team now.`;
      setSuccess(readyMessage);
      setHireStatus({ state: "ready", message: readyMessage });
      await load({ preserveMessages: true });
      window.setTimeout(() => window.location.assign("/team"), 900);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mission Control could not finish hiring this employee.";
      setHireError(message);
      await load({ preserveMessages: true });
    } finally { setBusy(false); }
  };

  const employeeAction = async (agentId: number, action: "start" | "stop" | "restart" | "health" | "decommission") => {
    const labels = { start: "Resume", stop: "Pause", restart: "Restart", health: "Connection check", decommission: "Remove" };
    setBusy(true); setError(""); setSuccess("");
    try { const result = await authedFetch<{ ok: boolean; status: string }>(`/api/provisioning/agents/${agentId}/runtime/${action}`, { method: "POST", body: "{}" }); setSuccess(`${labels[action]} completed. Current status: ${friendlyHealth(result.status)}.`); await load({ preserveMessages: true }); }
    catch (err) { setError(err instanceof Error ? err.message : `${labels[action]} could not be completed.`); }
    finally { setBusy(false); }
  };

  return <div className="employee-factory-shell"><div className="employee-factory-canvas">
    <header className="employee-factory-hero"><div><div className="employee-factory-kicker"><Sparkles /> AI Team</div><h1>Hire an AI Employee</h1><p>Create the employee first. Mission Control can then train them with approved skills and grant access separately.</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || busy}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></header>
    {error && <div className="employee-factory-message error"><CircleAlert /><span>{error}</span></div>}
    {success && <div className="employee-factory-message success"><CheckCircle2 /><span>{success}</span></div>}

    <div className="employee-factory-grid"><main className="employee-factory-main">
      <section className="employee-factory-card">
        <div className="employee-factory-section-heading"><span className="employee-step">1</span><div><h2>Who are you hiring?</h2><p>Use normal job language. Nothing here assumes which business or project the employee belongs to.</p></div></div>
        <div className="employee-avatar-row">
          <label className="employee-avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void uploadAvatar(event.target.files?.[0])} disabled={avatarStatus.state === "uploading"} />{avatarStatus.state === "uploading" ? <Loader2 className="animate-spin" /> : avatarPreview ? <img src={avatarPreview} alt="Employee preview" /> : <ImagePlus />}<span>{avatarStatus.state === "uploading" ? "Uploading…" : avatarPreview ? "Change photo" : "Add employee photo"}</span></label>
          <div className="employee-avatar-copy"><strong>Employee photo</strong><span>Optional. Mission Control resizes and stores it separately so it never slows down hiring.</span>{avatarStatus.state !== "idle" && <span className={`employee-avatar-status ${avatarStatus.state}`}>{avatarStatus.state === "ready" && <CheckCircle2 />}{avatarStatus.state === "error" && <CircleAlert />}{avatarStatus.state === "uploading" && <Loader2 className="animate-spin" />}{avatarStatus.message}</span>}</div>
        </div>
        <div className="employee-field-grid">
          <div className="employee-field"><Label>Employee name</Label><Input value={form.name} onChange={e => setForm(c => ({ ...c, name: e.target.value }))} placeholder="e.g. Amanda" /></div>
          <div className="employee-field"><Label>Job title</Label><Input value={form.role} onChange={e => setForm(c => ({ ...c, role: e.target.value }))} placeholder="e.g. Financial Controller" /></div>
          <div className="employee-field"><Label>Department</Label><Input value={form.department} onChange={e => setForm(c => ({ ...c, department: e.target.value }))} placeholder="e.g. Finance & Operations" /></div>
          <div className="employee-field"><Label>Project</Label><Select value={form.projectId} onValueChange={value => setForm(c => ({ ...c, projectId: value }))}><SelectTrigger><SelectValue placeholder={projects.length ? "Choose a Mission Control project" : "No projects available"} /></SelectTrigger><SelectContent>{projects.map(project => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}</SelectContent></Select><span className="employee-help">Projects come from Mission Control. Add the project first if it is not listed.</span></div>
          <div className="employee-field"><Label>Reports to</Label><Input value={form.owner} onChange={e => setForm(c => ({ ...c, owner: e.target.value }))} placeholder="Owner or manager" /></div>
        </div>
        <div className="employee-field employee-field-wide"><Label>What is this employee responsible for?</Label><Textarea rows={5} value={form.responsibilities} onChange={e => setForm(c => ({ ...c, responsibilities: e.target.value }))} placeholder="Brief them as you would a real employee." /></div>
      </section>

      <section className="employee-factory-card">
        <div className="employee-factory-section-heading"><span className="employee-step">2</span><div><h2>Choose how this employee works</h2><p>If you do not already have an agent, choose OpenClaw and Mission Control sets it up for you.</p></div></div>
        <div className="employee-runtime-options">
          <button type="button" className={`employee-runtime-option ${runtimeChoice === "openclaw" ? "selected" : ""}`} onClick={() => chooseRuntime("openclaw")}><Bot /><strong>OpenClaw</strong><span>Recommended · set up automatically</span><small>No existing agent required.</small></button>
          <button type="button" className="employee-runtime-option unavailable" onClick={() => chooseRuntime("hermes")}><Cpu /><strong>Hermes</strong><span>Advanced autonomous runtime</span><small>Visible now; one-click provisioning is not implemented yet.</small></button>
          <button type="button" className="employee-runtime-option unavailable" onClick={() => chooseRuntime("existing")}><BriefcaseBusiness /><strong>Connect existing agent</strong><span>Use an agent you already run</span><small>Connection workflow is planned, not yet available.</small></button>
        </div>
        <div className="employee-skill-start"><ShieldCheck /><div><strong>Starts with no Mission Control skills</strong><span>OpenClaw or Hermes may have native capabilities, but Mission Control training is assigned later from the Skills section.</span></div></div>
      </section>

      <section className="employee-factory-card">
        <div className="employee-factory-section-heading"><span className="employee-step">3</span><div><h2>Choose their AI account</h2><p>This pays for and powers the employee's AI. Mission Control stores the key securely.</p></div></div>
        <div className="employee-account-row"><div className="employee-field grow"><Label>AI account</Label><Select value={form.secretId} onValueChange={value => setForm(c => ({ ...c, secretId: value }))}><SelectTrigger><SelectValue placeholder="Choose a saved AI account" /></SelectTrigger><SelectContent>{overview?.secrets.filter(secret => secret.status === "active").map(secret => <SelectItem key={secret.id} value={String(secret.id)}>{secret.name}{secret.valueHint ? ` · ${secret.valueHint}` : ""}</SelectItem>)}</SelectContent></Select></div><Button type="button" variant="outline" onClick={() => setAddAccountOpen(v => !v)}><KeyRound className="mr-2 h-4 w-4" />{addAccountOpen ? "Cancel" : "Add AI account"}</Button></div>
        {addAccountOpen && <div className="employee-account-add"><div className="employee-field"><Label>Account name</Label><Input value={secretForm.name} onChange={e => setSecretForm(c => ({ ...c, name: e.target.value }))} /></div><div className="employee-field"><Label>OpenRouter API key</Label><Input type="password" value={secretForm.value} onChange={e => setSecretForm(c => ({ ...c, value: e.target.value }))} placeholder="Paste key here" /></div><Button onClick={() => void saveAccount()} disabled={busy || !secretForm.value.trim()}><ShieldCheck className="mr-2 h-4 w-4" />Save securely</Button></div>}
        {selectedAccount && <div className="employee-selected-summary"><ShieldCheck /><span><strong>{selectedAccount.name}</strong> is selected and stored securely.</span></div>}
      </section>

      <section className="employee-factory-card employee-advanced-card"><button type="button" className="employee-advanced-toggle" onClick={() => setAdvancedOpen(v => !v)}><div><h2>Advanced settings</h2><p>Technical defaults selected by Mission Control.</p></div>{advancedOpen ? <ChevronUp /> : <ChevronDown />}</button>{advancedOpen && <div className="employee-advanced-grid"><div className="employee-field"><Label>Worker setup</Label><Select value={form.templateId} onValueChange={value => setForm(c => ({ ...c, templateId: value }))}><SelectTrigger><SelectValue placeholder="Automatic" /></SelectTrigger><SelectContent>{overview?.templates.map(template => <SelectItem key={template.id} value={String(template.id)}>{template.name}</SelectItem>)}</SelectContent></Select></div><div className="employee-field"><Label>AI model</Label><Input value={form.model} onChange={e => setForm(c => ({ ...c, model: e.target.value }))} /></div><div className="employee-field"><Label>Worker location</Label><Select value={form.runtimeHostId} onValueChange={value => setForm(c => ({ ...c, runtimeHostId: value }))}><SelectTrigger><SelectValue placeholder="Automatic" /></SelectTrigger><SelectContent>{overview?.hosts.filter(host => host.runtimeType === "openclaw").map(host => <SelectItem key={host.id} value={String(host.id)}>{host.name}</SelectItem>)}</SelectContent></Select></div></div>}</section>

      <section className={`employee-hire-bar ${hireStatus.state !== "idle" ? `hire-${hireStatus.state}` : ""}`}>
        <div className="employee-hire-copy"><strong>Ready to hire {form.name || "this employee"}?</strong><span>Project, runtime and AI account are required. Skills and additional access are assigned after hiring.</span>{hireStatus.state !== "idle" && <div className="employee-hire-status">{hireStatus.state === "working" && <Loader2 className="animate-spin" />}{hireStatus.state === "ready" && <CheckCircle2 />}{hireStatus.state === "error" && <CircleAlert />}<span>{hireStatus.message}</span></div>}</div>
        <Button size="lg" onClick={() => void hireEmployee()} disabled={busy || loading || runtimeChoice !== "openclaw" || avatarStatus.state === "uploading"}>{busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UserPlus className="mr-2 h-5 w-5" />}{busy ? "Hiring…" : "Hire employee"}</Button>
      </section>
    </main>

    <aside className="employee-factory-sidebar">
      <section className="employee-factory-card employee-preview-card">{avatarPreview ? <img className="employee-preview-avatar employee-preview-photo" src={avatarPreview} alt="Employee" /> : <div className="employee-preview-avatar"><Bot /></div>}<span className="employee-preview-eyebrow">New employee</span><h2>{form.name || "Unnamed employee"}</h2><p>{form.role || "Add a job title"}</p><div className="employee-preview-meta"><span><BriefcaseBusiness />{selectedProject?.name || "Project required"}</span><span><Cpu />{runtimeChoice === "openclaw" ? "OpenClaw" : runtimeChoice === "hermes" ? "Hermes" : "Existing agent"}</span><span><ShieldCheck />0 Mission Control skills</span></div></section>
      <section className="employee-factory-card employee-checklist-card"><h3>Mission Control will handle</h3><ul><li><CheckCircle2 />Create the employee and isolated workspace</li><li><CheckCircle2 />Connect the approved AI account securely</li><li><CheckCircle2 />Start and test the worker</li><li><CheckCircle2 />Add them to your AI Team</li><li><CheckCircle2 />Leave Mission Control skills unassigned until you train them</li></ul></section>
      <section className="employee-factory-card employee-status-card"><h3>Setup readiness</h3><div><span>Project</span><strong className={form.projectId ? "ready" : "missing"}>{form.projectId ? "Ready" : "Required"}</strong></div><div><span>Worker setup</span><strong className={runtimeChoice === "openclaw" && form.runtimeHostId ? "ready" : "missing"}>{runtimeChoice === "openclaw" && form.runtimeHostId ? "Ready" : "Required"}</strong></div><div><span>AI account</span><strong className={form.secretId ? "ready" : "missing"}>{form.secretId ? "Ready" : "Required"}</strong></div>{avatarStatus.state !== "idle" && <div><span>Employee photo</span><strong className={avatarStatus.state === "ready" ? "ready" : avatarStatus.state === "error" ? "missing" : ""}>{avatarStatus.state === "ready" ? "Ready" : avatarStatus.state === "uploading" ? "Uploading" : "Optional"}</strong></div>}</section>
    </aside></div>

    {employeeRows.length > 0 && <section className="employee-existing-section"><div className="employee-existing-heading"><h2>Managed employees</h2><p>Employees already provisioned by Mission Control.</p></div><div className="employee-existing-grid">{employeeRows.map(row => <article key={row.id} className="employee-existing-card"><div><div className="employee-existing-name">{row.profile?.avatarUrl ? <img className="employee-existing-photo" src={row.profile.avatarUrl} alt="" /> : <Bot />}<div><strong>{row.agent?.name || `Employee ${row.agentId}`}</strong><span>{row.agent?.role || "AI employee"}{row.profile?.projectName ? ` · ${row.profile.projectName}` : ""}</span></div></div><span className={`employee-health ${friendlyHealth(row.health) === "Ready" ? "ready" : ""}`}>{friendlyHealth(row.health)}</span></div>{row.lastError && <p className="employee-runtime-error">{row.lastError}</p>}<div className="employee-existing-actions"><Button variant="outline" size="sm" onClick={() => void employeeAction(row.agentId, "health")}><RefreshCw className="mr-1 h-3 w-3" />Check</Button><Button variant="outline" size="sm" onClick={() => void employeeAction(row.agentId, "stop")}><Pause className="mr-1 h-3 w-3" />Pause</Button><Button variant="outline" size="sm" onClick={() => void employeeAction(row.agentId, "start")}><Play className="mr-1 h-3 w-3" />Resume</Button><Button variant="outline" size="sm" onClick={() => void employeeAction(row.agentId, "restart")}><RotateCw className="mr-1 h-3 w-3" />Restart</Button><Button variant="outline" size="sm" onClick={() => void employeeAction(row.agentId, "decommission")}><Trash2 className="mr-1 h-3 w-3" />Remove setup</Button></div></article>)}</div></section>}
  </div></div>;
}
