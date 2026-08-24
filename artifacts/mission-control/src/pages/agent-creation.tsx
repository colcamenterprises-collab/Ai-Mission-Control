import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Cpu,
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

type RuntimeHost = { id: number; name: string; runtimeType: string; hostType: string; rootDir: string; cliPath?: string | null; status: string };
type SecretRef = { id: number; name: string; kind: string; provider?: string | null; valueHint?: string | null; status: string };
type EmployeeTemplate = { id: number; name: string; description?: string | null; runtimeType: string; provider?: string | null; model?: string | null; department?: string | null };
type RuntimeInstance = { id: number; agentId: number; runtimeHostId?: number | null; runtimeType: string; runtimeAgentId?: string | null; workspacePath?: string | null; model?: string | null; status: string; health: string; lastError?: string | null };
type AgentSummary = { id: number; name: string; role: string; department: string; status: string; isPluggedIn: boolean };
type Overview = { hosts: RuntimeHost[]; secrets: SecretRef[]; templates: EmployeeTemplate[]; instances: RuntimeInstance[]; agents: AgentSummary[] };

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
    const payload = text.trim() ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
    return payload as T;
  } finally {
    window.clearTimeout(timeout);
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [secretForm, setSecretForm] = useState({ name: "Customli OpenRouter", provider: "openrouter", value: "" });
  const [form, setForm] = useState({
    name: "Amanda",
    role: "SBB Financial Controller",
    department: "Finance & Operations",
    business: "Smash Brothers Burgers",
    owner: "Cam",
    responsibilities: "Review each shift's financial results, investigate anomalies, keep the Profit & Loss accurate, check banking and expenses, identify cost-saving opportunities, and provide management reporting and recommendations.",
    runtimeHostId: "",
    templateId: "",
    secretId: "",
    model: "openrouter/auto",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await authedFetch<Overview>("/api/provisioning/overview", { method: "GET" }, 30_000);
      setOverview(data);
      setForm(current => ({
        ...current,
        runtimeHostId: current.runtimeHostId || String(data.hosts.find(host => host.runtimeType === "openclaw" && host.status === "active")?.id ?? data.hosts[0]?.id ?? ""),
        templateId: current.templateId || String(data.templates.find(template => template.runtimeType === "openclaw")?.id ?? data.templates[0]?.id ?? ""),
        secretId: current.secretId || String(data.secrets.find(secret => secret.provider === "openrouter" && secret.status === "active")?.id ?? ""),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission Control could not load the hiring setup. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const employeeRows = useMemo(() => {
    if (!overview) return [];
    return overview.instances.map(instance => ({ ...instance, agent: overview.agents.find(agent => agent.id === instance.agentId) }));
  }, [overview]);

  const saveAccount = async () => {
    if (!secretForm.name.trim() || !secretForm.value.trim()) return setError("Give this AI account a name and enter the API key.");
    setBusy(true); setError(""); setSuccess("");
    try {
      const secret = await authedFetch<SecretRef>("/api/provisioning/secrets", {
        method: "POST",
        body: JSON.stringify({ name: secretForm.name, provider: secretForm.provider, kind: "api_key", value: secretForm.value }),
      }, 30_000);
      setSecretForm(current => ({ ...current, value: "" }));
      setForm(current => ({ ...current, secretId: String(secret.id) }));
      setAddAccountOpen(false);
      setSuccess(`${secret.name} is saved securely and ready to use.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission Control could not save this AI account.");
    } finally { setBusy(false); }
  };

  const hireEmployee = async () => {
    if (!form.name.trim() || !form.role.trim()) return setError("Add the employee's name and job title first.");
    if (!form.runtimeHostId) return setError("No AI worker location is available yet. Mission Control needs an active worker host before hiring can continue.");
    if (!form.secretId) return setError("Choose an AI account for this employee, or add one securely below.");
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await authedFetch<{ agent: AgentSummary; instance: RuntimeInstance }>("/api/provisioning/employees", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          runtimeHostId: Number(form.runtimeHostId),
          templateId: form.templateId ? Number(form.templateId) : null,
          secretId: Number(form.secretId),
          runtimeType: "openclaw",
          provider: "openrouter",
        }),
      });
      setSuccess(`${result.agent.name} has been hired, set up and checked by Mission Control. They are ready for work.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission Control could not finish hiring this employee.");
      await load();
    } finally { setBusy(false); }
  };

  const employeeAction = async (agentId: number, action: "start" | "stop" | "restart" | "health" | "decommission") => {
    const labels = { start: "Resume", stop: "Pause", restart: "Restart", health: "Connection check", decommission: "Remove" };
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await authedFetch<{ ok: boolean; status: string }>(`/api/provisioning/agents/${agentId}/runtime/${action}`, { method: "POST", body: "{}" });
      setSuccess(`${labels[action]} completed successfully. Current status: ${friendlyHealth(result.status)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${labels[action]} could not be completed.`);
    } finally { setBusy(false); }
  };

  const selectedAccount = overview?.secrets.find(secret => String(secret.id) === form.secretId);
  const selectedTemplate = overview?.templates.find(template => String(template.id) === form.templateId);
  const selectedHost = overview?.hosts.find(host => String(host.id) === form.runtimeHostId);

  return (
    <div className="employee-factory-shell">
      <div className="employee-factory-canvas">
        <header className="employee-factory-hero">
          <div>
            <div className="employee-factory-kicker"><Sparkles /> AI Team</div>
            <h1>Hire an AI Employee</h1>
            <p>Describe the person you need. Mission Control handles the technical setup, security and connection checks for you.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || busy}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </header>

        {error && <div className="employee-factory-message error"><CircleAlert /> <span>{error}</span></div>}
        {success && <div className="employee-factory-message success"><CheckCircle2 /> <span>{success}</span></div>}

        <div className="employee-factory-grid">
          <main className="employee-factory-main">
            <section className="employee-factory-card">
              <div className="employee-factory-section-heading"><span className="employee-step">1</span><div><h2>Who are you hiring?</h2><p>Use normal job language. This is how the employee will appear across Mission Control.</p></div></div>
              <div className="employee-field-grid">
                <div className="employee-field"><Label>Employee name</Label><Input value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} placeholder="Amanda" /></div>
                <div className="employee-field"><Label>Job title</Label><Input value={form.role} onChange={e => setForm(current => ({ ...current, role: e.target.value }))} placeholder="Financial Controller" /></div>
                <div className="employee-field"><Label>Department</Label><Input value={form.department} onChange={e => setForm(current => ({ ...current, department: e.target.value }))} placeholder="Finance & Operations" /></div>
                <div className="employee-field"><Label>Business or project</Label><Input value={form.business} onChange={e => setForm(current => ({ ...current, business: e.target.value }))} placeholder="Smash Brothers Burgers" /></div>
                <div className="employee-field"><Label>Reports to</Label><Input value={form.owner} onChange={e => setForm(current => ({ ...current, owner: e.target.value }))} placeholder="Owner or manager" /></div>
              </div>
              <div className="employee-field employee-field-wide"><Label>What is this employee responsible for?</Label><Textarea rows={5} value={form.responsibilities} onChange={e => setForm(current => ({ ...current, responsibilities: e.target.value }))} /><span className="employee-help">Write this as you would brief a real employee. Mission Control uses it to define their working role.</span></div>
            </section>

            <section className="employee-factory-card">
              <div className="employee-factory-section-heading"><span className="employee-step">2</span><div><h2>Choose their AI account</h2><p>This pays for and powers the employee's AI. Mission Control stores the key securely and never shows it again.</p></div></div>
              <div className="employee-account-row">
                <div className="employee-field grow"><Label>AI account</Label><Select value={form.secretId} onValueChange={value => setForm(current => ({ ...current, secretId: value }))}><SelectTrigger><SelectValue placeholder="Choose a saved AI account" /></SelectTrigger><SelectContent>{overview?.secrets.filter(secret => secret.status === "active").map(secret => <SelectItem key={secret.id} value={String(secret.id)}>{secret.name}{secret.valueHint ? ` · ${secret.valueHint}` : ""}</SelectItem>)}</SelectContent></Select></div>
                <Button type="button" variant="outline" onClick={() => setAddAccountOpen(value => !value)}><KeyRound className="mr-2 h-4 w-4" />{addAccountOpen ? "Cancel" : "Add AI account"}</Button>
              </div>
              {addAccountOpen && <div className="employee-account-add"><div className="employee-field"><Label>Account name</Label><Input value={secretForm.name} onChange={e => setSecretForm(current => ({ ...current, name: e.target.value }))} placeholder="Company OpenRouter" /></div><div className="employee-field"><Label>OpenRouter API key</Label><Input type="password" value={secretForm.value} onChange={e => setSecretForm(current => ({ ...current, value: e.target.value }))} placeholder="Paste key here" /></div><Button onClick={() => void saveAccount()} disabled={busy || !secretForm.value.trim()}><ShieldCheck className="mr-2 h-4 w-4" />Save securely</Button></div>}
              {selectedAccount && <div className="employee-selected-summary"><ShieldCheck /><span><strong>{selectedAccount.name}</strong> is selected and stored securely.</span></div>}
            </section>

            <section className="employee-factory-card employee-advanced-card">
              <button type="button" className="employee-advanced-toggle" onClick={() => setAdvancedOpen(value => !value)} aria-expanded={advancedOpen}><div><h2>Advanced settings</h2><p>Most users never need to change these. Mission Control has already selected sensible defaults.</p></div>{advancedOpen ? <ChevronUp /> : <ChevronDown />}</button>
              {advancedOpen && <div className="employee-advanced-grid">
                <div className="employee-field"><Label>Worker setup</Label><Select value={form.templateId} onValueChange={value => setForm(current => ({ ...current, templateId: value }))}><SelectTrigger><SelectValue placeholder="Automatic" /></SelectTrigger><SelectContent>{overview?.templates.map(template => <SelectItem key={template.id} value={String(template.id)}>{template.name}</SelectItem>)}</SelectContent></Select><span className="employee-help">Defines the employee's standard working setup.</span></div>
                <div className="employee-field"><Label>AI model</Label><Input value={form.model} onChange={e => setForm(current => ({ ...current, model: e.target.value }))} /><span className="employee-help">Leave on automatic unless you have a specific model requirement.</span></div>
                <div className="employee-field"><Label>Worker location</Label><Select value={form.runtimeHostId} onValueChange={value => setForm(current => ({ ...current, runtimeHostId: value }))}><SelectTrigger><SelectValue placeholder="Automatic" /></SelectTrigger><SelectContent>{overview?.hosts.map(host => <SelectItem key={host.id} value={String(host.id)}>{host.name}</SelectItem>)}</SelectContent></Select><span className="employee-help">The server where this employee runs.</span></div>
              </div>}
            </section>

            <section className="employee-hire-bar">
              <div><strong>Ready to hire {form.name || "this employee"}?</strong><span>Mission Control will create, connect and test the employee before marking them ready.</span></div>
              <Button size="lg" onClick={() => void hireEmployee()} disabled={busy || loading}>{busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UserPlus className="mr-2 h-5 w-5" />}Hire {form.name || "AI Employee"}</Button>
            </section>
          </main>

          <aside className="employee-factory-sidebar">
            <section className="employee-factory-card employee-preview-card">
              <div className="employee-preview-avatar"><Bot /></div>
              <span className="employee-preview-eyebrow">New employee</span>
              <h2>{form.name || "Unnamed employee"}</h2>
              <p>{form.role || "Add a job title"}</p>
              <div className="employee-preview-meta"><span><BriefcaseBusiness />{form.business || "Business not set"}</span><span><Cpu />{selectedTemplate?.name || "Automatic worker setup"}</span><span><ShieldCheck />{selectedAccount?.name || "AI account required"}</span></div>
            </section>
            <section className="employee-factory-card employee-checklist-card"><h3>Mission Control will handle</h3><ul><li><CheckCircle2 />Create a private workspace for the employee</li><li><CheckCircle2 />Connect the approved AI account securely</li><li><CheckCircle2 />Set up the employee's working instructions</li><li><CheckCircle2 />Start the employee and check the connection</li><li><CheckCircle2 />Add them to your AI Team when ready</li></ul></section>
            <section className="employee-factory-card employee-status-card"><h3>Setup readiness</h3><div><span>Worker location</span><strong className={selectedHost ? "ready" : "missing"}>{selectedHost ? "Ready" : "Required"}</strong></div><div><span>AI account</span><strong className={selectedAccount ? "ready" : "missing"}>{selectedAccount ? "Ready" : "Required"}</strong></div><div><span>Employee setup</span><strong className={selectedTemplate ? "ready" : "missing"}>{selectedTemplate ? "Ready" : "Automatic"}</strong></div></section>
          </aside>
        </div>

        {employeeRows.length > 0 && <section className="employee-existing-section"><div className="employee-existing-heading"><div><h2>Employees created by Mission Control</h2><p>Check their connection, pause work, restart them, or remove the worker setup.</p></div></div><div className="employee-existing-grid">{employeeRows.map(row => <article key={row.id} className="employee-existing-card"><div><div className="employee-existing-name"><Bot /> <div><strong>{row.agent?.name ?? `Employee #${row.agentId}`}</strong><span>{row.agent?.role ?? "AI employee"}</span></div></div><span className={`employee-health ${friendlyHealth(row.health) === "Ready" ? "ready" : ""}`}>{friendlyHealth(row.health)}</span></div>{row.lastError && <p className="employee-runtime-error">{row.lastError}</p>}<div className="employee-existing-actions"><Button size="sm" variant="outline" onClick={() => void employeeAction(row.agentId, "health")} disabled={busy}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Check connection</Button><Button size="sm" variant="outline" onClick={() => void employeeAction(row.agentId, "stop")} disabled={busy}><Pause className="mr-1.5 h-3.5 w-3.5" />Pause</Button><Button size="sm" variant="outline" onClick={() => void employeeAction(row.agentId, "start")} disabled={busy}><Play className="mr-1.5 h-3.5 w-3.5" />Resume</Button><Button size="sm" variant="outline" onClick={() => void employeeAction(row.agentId, "restart")} disabled={busy}><RotateCw className="mr-1.5 h-3.5 w-3.5" />Restart</Button><Button size="sm" variant="ghost" onClick={() => void employeeAction(row.agentId, "decommission")} disabled={busy}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Remove setup</Button></div></article>)}</div></section>}
      </div>
    </div>
  );
}