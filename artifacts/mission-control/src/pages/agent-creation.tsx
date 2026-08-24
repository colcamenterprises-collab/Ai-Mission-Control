import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, KeyRound, Loader2, Play, RefreshCw, Server, ShieldCheck, Square, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const PRIMARY_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_STORAGE_KEY = "missionControlAdminToken";

type RuntimeHost = {
  id: number;
  name: string;
  runtimeType: string;
  hostType: string;
  rootDir: string;
  cliPath?: string | null;
  status: string;
};

type SecretRef = {
  id: number;
  name: string;
  kind: string;
  provider?: string | null;
  valueHint?: string | null;
  status: string;
};

type EmployeeTemplate = {
  id: number;
  name: string;
  description?: string | null;
  runtimeType: string;
  provider?: string | null;
  model?: string | null;
  department?: string | null;
};

type RuntimeInstance = {
  id: number;
  agentId: number;
  runtimeHostId?: number | null;
  runtimeType: string;
  runtimeAgentId?: string | null;
  workspacePath?: string | null;
  model?: string | null;
  status: string;
  health: string;
  lastError?: string | null;
};

type AgentSummary = {
  id: number;
  name: string;
  role: string;
  department: string;
  status: string;
  isPluggedIn: boolean;
};

type Overview = {
  hosts: RuntimeHost[];
  secrets: SecretRef[];
  templates: EmployeeTemplate[];
  instances: RuntimeInstance[];
  agents: AgentSummary[];
};

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

export default function AgentCreation() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [secretForm, setSecretForm] = useState({ name: "Customli OpenRouter", provider: "openrouter", value: "" });
  const [form, setForm] = useState({
    name: "Amanda",
    role: "SBB Financial Controller",
    department: "Operations",
    business: "Smash Brothers Burgers",
    owner: "Cam",
    responsibilities: "Own SBB financial reconciliation, P&L accuracy, anomaly investigation, cost-control analysis, banking checks and management reporting.",
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
        runtimeHostId: current.runtimeHostId || String(data.hosts.find(host => host.runtimeType === "openclaw")?.id ?? ""),
        templateId: current.templateId || String(data.templates.find(template => template.runtimeType === "openclaw")?.id ?? ""),
        secretId: current.secretId || String(data.secrets.find(secret => secret.provider === "openrouter" && secret.status === "active")?.id ?? ""),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load provisioning data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const instanceRows = useMemo(() => {
    if (!overview) return [];
    return overview.instances.map(instance => ({ ...instance, agent: overview.agents.find(agent => agent.id === instance.agentId) }));
  }, [overview]);

  const saveSecret = async () => {
    if (!secretForm.name.trim() || !secretForm.value.trim()) return setError("Secret name and API key are required.");
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const secret = await authedFetch<SecretRef>("/api/provisioning/secrets", {
        method: "POST",
        body: JSON.stringify({ name: secretForm.name, provider: secretForm.provider, kind: "api_key", value: secretForm.value }),
      }, 30_000);
      setSecretForm(current => ({ ...current, value: "" }));
      setForm(current => ({ ...current, secretId: String(secret.id) }));
      setSuccess(`${secret.name} saved securely. The key will not be shown again.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save secret.");
    } finally {
      setBusy(false);
    }
  };

  const createEmployee = async () => {
    if (!form.name.trim() || !form.role.trim() || !form.runtimeHostId || !form.secretId) {
      return setError("Name, role, runtime host and model-provider secret are required.");
    }
    setBusy(true);
    setError("");
    setSuccess("");
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
      setSuccess(`${result.agent.name} is provisioned and online as ${result.instance.runtimeAgentId}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Employee provisioning failed.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const lifecycle = async (agentId: number, action: "start" | "stop" | "restart" | "health" | "decommission") => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await authedFetch<{ ok: boolean; status: string }>(`/api/provisioning/agents/${agentId}/runtime/${action}`, { method: "POST", body: "{}" });
      setSuccess(`${action} completed: ${result.status}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} runtime.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Mission Control · Employee Factory</p>
          <h1 className="mt-1 text-2xl font-semibold">Create AI Employee</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Create the employee identity once. Mission Control provisions the runtime, attaches approved secrets, creates the isolated workspace, configures the model and verifies the worker.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || busy}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm"><CheckCircle2 className="mr-2 inline h-4 w-4" />{success}</div>}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-xl border border-border bg-card p-4 md:p-5">
          <div className="mb-4 flex items-center gap-2"><UserPlus className="h-5 w-5" /><h2 className="font-semibold">Employee</h2></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5"><Label>Name</Label><Input value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>Role</Label><Input value={form.role} onChange={e => setForm(current => ({ ...current, role: e.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>Department</Label><Input value={form.department} onChange={e => setForm(current => ({ ...current, department: e.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>Business / Project</Label><Input value={form.business} onChange={e => setForm(current => ({ ...current, business: e.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>Primary owner</Label><Input value={form.owner} onChange={e => setForm(current => ({ ...current, owner: e.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>Model</Label><Input value={form.model} onChange={e => setForm(current => ({ ...current, model: e.target.value }))} /></div>
          </div>
          <div className="mt-4 grid gap-1.5"><Label>Responsibilities</Label><Textarea rows={4} value={form.responsibilities} onChange={e => setForm(current => ({ ...current, responsibilities: e.target.value }))} /></div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="grid gap-1.5"><Label>Runtime</Label><Select value={form.runtimeHostId} onValueChange={value => setForm(current => ({ ...current, runtimeHostId: value }))}><SelectTrigger><SelectValue placeholder="Select host" /></SelectTrigger><SelectContent>{overview?.hosts.map(host => <SelectItem key={host.id} value={String(host.id)}>{host.name} · {host.runtimeType}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1.5"><Label>Employee template</Label><Select value={form.templateId} onValueChange={value => setForm(current => ({ ...current, templateId: value }))}><SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger><SelectContent>{overview?.templates.map(template => <SelectItem key={template.id} value={String(template.id)}>{template.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1.5"><Label>Provider secret</Label><Select value={form.secretId} onValueChange={value => setForm(current => ({ ...current, secretId: value }))}><SelectTrigger><SelectValue placeholder="Select secret" /></SelectTrigger><SelectContent>{overview?.secrets.filter(secret => secret.status === "active").map(secret => <SelectItem key={secret.id} value={String(secret.id)}>{secret.name} · {secret.valueHint}</SelectItem>)}</SelectContent></Select></div>
          </div>

          <div className="mt-5 flex justify-end"><Button onClick={() => void createEmployee()} disabled={busy || loading}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}Create Employee</Button></div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2"><KeyRound className="h-4 w-4" /><h2 className="font-semibold">Secrets Vault</h2></div>
            <p className="mb-3 text-xs text-muted-foreground">Save a provider credential once. Employees receive scoped references; the value is never returned by the API.</p>
            <div className="grid gap-2">
              <Input placeholder="Secret name" value={secretForm.name} onChange={e => setSecretForm(current => ({ ...current, name: e.target.value }))} />
              <Input type="password" placeholder="OpenRouter API key" value={secretForm.value} onChange={e => setSecretForm(current => ({ ...current, value: e.target.value }))} />
              <Button variant="outline" onClick={() => void saveSecret()} disabled={busy || !secretForm.value.trim()}><ShieldCheck className="mr-2 h-4 w-4" />Save secret</Button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2"><Server className="h-4 w-4" /><h2 className="font-semibold">Runtime Hosts</h2></div>
            <div className="space-y-2">{loading ? <p className="text-sm text-muted-foreground">Loading…</p> : overview?.hosts.map(host => <div key={host.id} className="rounded-lg border border-border/70 p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{host.name}</span><span className="text-xs uppercase text-muted-foreground">{host.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{host.runtimeType} · {host.rootDir}</p></div>)}</div>
          </section>
        </aside>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Managed Employees</h2><p className="text-xs text-muted-foreground">Employee identity and runtime lifecycle are separate. Decommissioning a runtime does not delete the employee record.</p></div></div>
        <div className="space-y-3">
          {instanceRows.length === 0 && <p className="text-sm text-muted-foreground">No managed runtimes yet. Amanda will be the first certification employee.</p>}
          {instanceRows.map(row => <div key={row.id} className="grid gap-3 rounded-lg border border-border/70 p-3 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{row.agent?.name ?? `Agent #${row.agentId}`}</span><span className="rounded-full border px-2 py-0.5 text-[11px] uppercase">{row.status}</span><span className="rounded-full border px-2 py-0.5 text-[11px] uppercase">{row.health}</span></div><p className="mt-1 text-xs text-muted-foreground">{row.agent?.role} · {row.runtimeType} · {row.model || "default model"}</p>{row.lastError && <p className="mt-1 text-xs text-destructive">{row.lastError}</p>}</div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void lifecycle(row.agentId, "health")} disabled={busy}><RefreshCw className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={() => void lifecycle(row.agentId, "start")} disabled={busy}><Play className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={() => void lifecycle(row.agentId, "stop")} disabled={busy}><Square className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={() => void lifecycle(row.agentId, "restart")} disabled={busy}><RefreshCw className="h-3.5 w-3.5" /></Button><Button size="sm" variant="destructive" onClick={() => window.confirm(`Decommission ${row.agent?.name ?? "this runtime"}? The employee record will remain.`) && void lifecycle(row.agentId, "decommission")} disabled={busy}><Trash2 className="h-3.5 w-3.5" /></Button></div></div>)}
        </div>
      </section>
    </div>
  );
}
