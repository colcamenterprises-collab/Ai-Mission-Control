import { useState } from "react";
import {
  useListAgents,
  useCreateAgent,
  useUpdateAgent,
  useListAgentIntegrations,
  useDispatchAgent,
  useRegenerateAgentToken,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plug, Plus, CheckCircle2, Eye, EyeOff, Trash2, ChevronLeft, ExternalLink, Copy, Check, Radio, Send, RefreshCw, Terminal, ShieldCheck, Users } from "lucide-react";
import James from "@/pages/james";
import "./workspaces.css";

function isOnline(lastPing: string | null | undefined): boolean {
  if (!lastPing) return false;
  return Date.now() - new Date(lastPing).getTime() < 120_000; // 2 minutes
}

function timeSince(lastPing: string | null | undefined): string {
  if (!lastPing) return "never";
  const secs = Math.floor((Date.now() - new Date(lastPing).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}


type CoreAgent = {
  name: string;
  role: string;
  status: string;
  currentTask: string;
  permissions: string;
};

const CORE_AGENT_TEAM: CoreAgent[] = [
  { name: "James", role: "Orchestrator", status: "Online", currentTask: "Review user-created tasks and coordinate delegation", permissions: "Read Only / Safety gated" },
  { name: "OpenClaw / OpenCore", role: "Build Agent / Coding Agent", status: "Configurable", currentTask: "Awaiting delegated build task", permissions: "Configurable by repository and environment" },
  { name: "Scout", role: "Research", status: "Offline", currentTask: "No active research job", permissions: "Read-only research context" },
  { name: "Scribe", role: "Documentation / Content", status: "Offline", currentTask: "No active documentation job", permissions: "Content and memory drafting" },
  { name: "Reach", role: "Marketing / Outreach", status: "Offline", currentTask: "No active outreach job", permissions: "Contacts/content review required" },
];

const CURRENT_ORCHESTRATOR_AGENT = CORE_AGENT_TEAM.find((agent) => agent.role === "Orchestrator") ?? CORE_AGENT_TEAM[0];

function CoreAgentCard({ agent }: { agent: CoreAgent }) {
  const online = agent.status.toLowerCase() === "online";
  return (
    <article className="workspace-panel p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${online ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-muted-foreground"}`}>
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight">{agent.name}</h3>
            <p className="text-xs text-muted-foreground">Role: {agent.role}</p>
          </div>
        </div>
        <Badge variant={online ? "default" : "outline"} className="font-mono text-[10px] uppercase">{agent.status}</Badge>
      </div>
      <div className="space-y-2 text-xs">
        <div className="diagnostic-row"><span className="font-mono uppercase tracking-wider text-muted-foreground">Current task</span><span className="text-right">{agent.currentTask}</span></div>
        <div className="diagnostic-row"><span className="font-mono uppercase tracking-wider text-muted-foreground">Permissions / mode</span><span className="text-right">{agent.permissions}</span></div>
      </div>
    </article>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {label ?? (copied ? "Copied!" : "Copy")}
    </button>
  );
}

/* ─── Dispatch Dialog ────────────────────────────────────────── */
function DispatchDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const dispatch = useDispatchAgent();
  const [instructions, setInstructions] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<{
    queued: boolean;
    dispatched: boolean;
    delivery: "http" | "queued";
    commandId: number;
    error?: string | null;
    statusCode?: number | null;
  } | null>(null);

  const handleSend = async () => {
    const res = await dispatch.mutateAsync({
      id: agent.id,
      data: { instructions, context: context || null, taskId: null },
    });
    setResult(res as typeof result);
  };

  const deliveryLabel = result?.delivery === "http"
    ? { icon: "✓", color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", title: "Delivered via HTTP", body: "The agent's endpoint received your instructions directly." }
    : { icon: "⏳", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", title: "Queued — picks up on next ping", body: agent.endpoint ? "HTTP push failed. The command is stored and the agent will pick it up on its next heartbeat." : "No public endpoint — the agent will pick this up on its next heartbeat (every 30s)." };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2 text-sm">
            <Send className="w-4 h-4 text-primary" />
            Dispatch to {agent.name}
          </DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg border ${deliveryLabel.bg}`}>
              <p className={`text-sm font-mono font-medium ${deliveryLabel.color}`}>
                {deliveryLabel.icon} {deliveryLabel.title}
              </p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{deliveryLabel.body}</p>
              {result.statusCode && result.delivery === "http" && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">HTTP {result.statusCode}</p>
              )}
              {result.error && (
                <p className="text-xs text-muted-foreground/70 mt-1 font-mono text-[10px]">{result.error}</p>
              )}
            </div>
            <p className="text-xs font-mono text-muted-foreground">Command ID: #{result.commandId}</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setResult(null); setInstructions(""); setContext(""); }}>Send Another</Button>
              <Button size="sm" onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {agent.endpoint ? (
              <div className="p-3 bg-secondary/40 rounded-lg text-xs font-mono text-muted-foreground truncate">
                → {agent.endpoint}
              </div>
            ) : (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400 font-mono flex items-center gap-2">
                <Radio className="w-3 h-3 flex-shrink-0" />
                No endpoint — command will be queued and picked up on next ping
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Instructions *</Label>
              <Textarea
                placeholder={`Tell ${agent.name} what to do. Be specific — this is sent directly to its process.`}
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                className="text-sm resize-none h-28"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Context (optional)</Label>
              <Textarea
                placeholder="Additional context, data snippets, or constraints…"
                value={context}
                onChange={e => setContext(e.target.value)}
                className="text-sm resize-none h-16"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!instructions.trim() || dispatch.isPending}
                className="gap-2"
              >
                <Send className="w-3 h-3" />
                {dispatch.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Bridge Connection section (inside agent detail) ─────────── */
function BridgeSection({ agent, onTokenRefreshed }: { agent: Agent; onTokenRefreshed: () => void }) {
  const regen = useRegenerateAgentToken();
  const [showDispatch, setShowDispatch] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [localToken, setLocalToken] = useState<string | null>(agent.inboundToken ?? null);
  const online = isOnline(agent.lastPing);

  const handleRegen = async () => {
    const res = await regen.mutateAsync({ id: agent.id });
    setLocalToken(res.inboundToken);
    setShowToken(true);
    onTokenRefreshed();
  };

  const mcUrl = window.location.origin;
  const tok = localToken ?? "<YOUR_TOKEN>";
  const curlPing = `# 1. Heartbeat — call every 30s; response includes queued commands
curl -X POST ${mcUrl}/api/agent/ping \\
  -H "Authorization: Bearer ${tok}" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId": ${agent.id}}'`;

  const curlAck = `# 2. Acknowledge a queued command so it won't repeat
#    Replace <commandId> with the id from pendingCommands[]
curl -X POST ${mcUrl}/api/agent/command/<commandId>/ack \\
  -H "Authorization: Bearer ${tok}" \\
  -H "Content-Type: application/json"`;

  const curlReport = `# 3. Report back — activity, task completion, or memory
curl -X POST ${mcUrl}/api/agent/report \\
  -H "Authorization: Bearer ${tok}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"activity","content":"Task complete"}'`;

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono uppercase text-muted-foreground">Bridge Connection</p>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${online ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "bg-muted-foreground/30"}`} />
            <span className="text-xs font-mono text-muted-foreground">
              {online ? "online" : `offline · ${timeSince(agent.lastPing)}`}
            </span>
          </div>
        </div>

        {/* Endpoint */}
        {agent.endpoint ? (
          <div className="p-2.5 bg-secondary/40 rounded-lg font-mono text-xs text-muted-foreground flex items-center justify-between gap-2">
            <span className="truncate">{agent.endpoint}</span>
            <CopyButton text={agent.endpoint} />
          </div>
        ) : (
          <div className="p-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs flex items-center gap-2">
            <Radio className="w-3 h-3 text-yellow-500 flex-shrink-0" />
            <span className="text-muted-foreground">
              No public endpoint — using <span className="text-yellow-400 font-mono">queue-based</span> delivery.
              Commands are picked up on the agent's next ping.
            </span>
          </div>
        )}

        {/* Token */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Inbound Token</span>
            <div className="flex items-center gap-3">
              {localToken && <CopyButton text={localToken} />}
              <button
                onClick={handleRegen}
                disabled={regen.isPending}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${regen.isPending ? "animate-spin" : ""}`} />
                {localToken ? "Regenerate" : "Generate Token"}
              </button>
            </div>
          </div>

          {localToken ? (
            <div
              className="p-2.5 bg-secondary/40 rounded-lg font-mono text-xs flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => setShowToken(v => !v)}
            >
              <span className="truncate text-primary/80">
                {showToken ? localToken : "••••••••••••••••••••" + localToken.slice(-8)}
              </span>
              <span className="text-muted-foreground flex-shrink-0">{showToken ? "hide" : "reveal"}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">No token yet — click Generate to create one.</p>
          )}
        </div>

        {/* Setup instructions */}
        {localToken && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
              <Terminal className="w-3 h-3" />
              Quick-start — works for local, Docker, or hosted agents:
            </div>
            {[curlPing, curlAck, curlReport].map((snippet, i) => (
              <div key={i} className="relative">
                <pre className="text-[10px] font-mono text-muted-foreground bg-secondary/60 rounded-lg p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">{snippet}</pre>
                <div className="absolute top-2 right-2"><CopyButton text={snippet} /></div>
              </div>
            ))}
          </div>
        )}

        {/* Dispatch button */}
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2 text-xs"
          onClick={() => setShowDispatch(true)}
        >
          <Send className="w-3 h-3" />
          Dispatch Instructions to Agent
        </Button>
      </div>

      {showDispatch && <DispatchDialog agent={agent} onClose={() => setShowDispatch(false)} />}
    </>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  dashboard: "from-cyan-600 to-cyan-800",
  crm: "from-purple-600 to-purple-800",
  analytics: "from-blue-600 to-blue-800",
  ecommerce: "from-emerald-600 to-emerald-800",
  social: "from-pink-600 to-pink-800",
  productivity: "from-amber-600 to-amber-800",
  devtools: "from-slate-600 to-slate-800",
  custom: "from-rose-600 to-rose-800",
};

function AgentAssignedApps({ agentId }: { agentId: number }) {
  const { data: integrations, isLoading } = useListAgentIntegrations(agentId);
  if (isLoading) return <div className="h-8 bg-secondary/40 animate-pulse rounded" />;
  if (!integrations?.length) return (
    <p className="text-xs text-muted-foreground/60 py-2">No apps assigned. Connect apps in Settings → App Connections.</p>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {integrations.map(i => (
        <a key={i.id} href={i.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary/60 hover:bg-secondary rounded-lg border border-border hover:border-primary/30 transition-colors group"
        >
          <div className={`w-5 h-5 rounded bg-gradient-to-br ${CATEGORY_COLORS[i.category] ?? "from-slate-600 to-slate-800"} flex items-center justify-center flex-shrink-0`}>
            <span className="font-mono text-[8px] font-bold text-white leading-none">{i.iconInitials}</span>
          </div>
          <span className="text-xs">{i.name}</span>
          <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors" />
        </a>
      ))}
    </div>
  );
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-primary shadow-[0_0_8px_rgba(0,212,255,0.8)]",
  pending: "bg-yellow-500",
  error: "bg-red-500",
  idle: "bg-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  active: "text-primary",
  pending: "text-yellow-400",
  error: "text-red-400",
  idle: "text-muted-foreground",
};

const DEPARTMENTS = ["Developers", "Writers", "Researchers", "Operators"] as const;

interface Provider {
  id: string;
  name: string;
  initials: string;
  color: string;
  description: string;
  models: string[];
  needsKey: boolean;
  needsEndpoint: boolean;
  keyPlaceholder: string;
  endpointPlaceholder?: string;
}

const PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    initials: "OA",
    color: "from-emerald-600 to-emerald-800",
    description: "GPT-4o, GPT-4 Turbo, o1 and more",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "o1-preview", "o1-mini"],
    needsKey: true,
    needsEndpoint: false,
    keyPlaceholder: "sk-...",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    initials: "AN",
    color: "from-orange-600 to-orange-800",
    description: "Claude 3.5 Sonnet, Claude 3 Opus and more",
    models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229"],
    needsKey: true,
    needsEndpoint: false,
    keyPlaceholder: "sk-ant-...",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    initials: "GG",
    color: "from-blue-600 to-blue-800",
    description: "Gemini 1.5 Pro, Flash and more",
    models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"],
    needsKey: true,
    needsEndpoint: false,
    keyPlaceholder: "AIza...",
  },
  {
    id: "groq",
    name: "Groq",
    initials: "GQ",
    color: "from-purple-600 to-purple-800",
    description: "Ultra-fast inference: Llama, Mixtral",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    needsKey: true,
    needsEndpoint: false,
    keyPlaceholder: "gsk_...",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    initials: "MS",
    color: "from-sky-600 to-sky-800",
    description: "Mistral Large, Mixtral 8x22B and more",
    models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "open-mixtral-8x22b"],
    needsKey: true,
    needsEndpoint: false,
    keyPlaceholder: "...",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    initials: "OL",
    color: "from-slate-600 to-slate-800",
    description: "Run models locally with Ollama",
    models: ["llama3", "mistral", "codellama", "phi3", "gemma2"],
    needsKey: false,
    needsEndpoint: true,
    keyPlaceholder: "",
    endpointPlaceholder: "http://localhost:11434",
  },
  {
    id: "custom",
    name: "Custom / OpenAI-compatible",
    initials: "CX",
    color: "from-rose-600 to-rose-800",
    description: "Any OpenAI-compatible API endpoint",
    models: [],
    needsKey: true,
    needsEndpoint: true,
    keyPlaceholder: "Your API key",
    endpointPlaceholder: "https://your-api.example.com/v1",
  },
];

function ProviderBadge({ provider }: { provider: string }) {
  const p = PROVIDERS.find(p => p.id === provider);
  if (!p) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-gradient-to-r ${p.color} text-white font-mono`}>
      {p.initials}
    </span>
  );
}

function AgentAvatar({ initials, isLead, status }: { initials: string; isLead?: boolean; status: string }) {
  return (
    <div className={`relative flex-shrink-0 ${isLead ? "w-16 h-16" : "w-10 h-10"} rounded-full bg-primary/20 border-2 ${isLead ? "border-primary" : "border-border"} flex items-center justify-center`}>
      <span className={`font-mono font-bold ${isLead ? "text-base" : "text-xs"} text-primary`}>{initials}</span>
      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background ${STATUS_DOT[status] ?? "bg-muted-foreground"}`} />
    </div>
  );
}

interface ConnectFormState {
  name: string;
  role: string;
  department: typeof DEPARTMENTS[number];
  endpoint: string;
  // AI model (step 2 — all optional)
  provider: string;
  model: string;
  customModel: string;
  apiKey: string;
  modelEndpoint: string;
}

const NO_PROVIDER = "__none__";

function ConnectAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState<ConnectFormState>({
    name: "", role: "", department: "Operators", endpoint: "",
    provider: NO_PROVIDER, model: "", customModel: "", apiKey: "", modelEndpoint: "",
  });
  const [error, setError] = useState("");
  const createAgent = useCreateAgent();

  const selectedProvider = PROVIDERS.find(p => p.id === form.provider) ?? null;

  const reset = () => {
    setStep(1);
    setShowKey(false);
    setForm({ name: "", role: "", department: "Operators", endpoint: "", provider: NO_PROVIDER, model: "", customModel: "", apiKey: "", modelEndpoint: "" });
    setError("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleStep1Next = () => {
    if (!form.name.trim()) { setError("Agent name is required."); return; }
    if (!form.role.trim()) { setError("Role is required."); return; }
    setError("");
    setStep(2);
  };

  const handleProviderChange = (id: string) => {
    const p = PROVIDERS.find(pr => pr.id === id);
    setForm(f => ({ ...f, provider: id, model: p?.models[0] ?? "", modelEndpoint: p?.endpointPlaceholder ?? "", apiKey: "" }));
  };

  const handleSubmit = async () => {
    // Validate AI model fields if a provider was chosen
    if (selectedProvider) {
      if (selectedProvider.needsKey && !form.apiKey.trim()) { setError("API key is required for this provider."); return; }
      const model = selectedProvider.id === "custom" ? form.customModel : form.model;
      if (!model.trim()) { setError("Model name is required."); return; }
      if (selectedProvider.needsEndpoint && !form.modelEndpoint.trim()) { setError("Provider endpoint URL is required."); return; }
    }

    setError("");
    const initials = form.name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "AG";
    const modelValue = selectedProvider?.id === "custom" ? form.customModel.trim() : form.model.trim();

    try {
      await createAgent.mutateAsync({
        data: {
          name: form.name.trim(),
          role: form.role.trim(),
          department: form.department,
          isLead: false,
          avatarInitials: initials,
          isPluggedIn: true,
          endpoint: form.endpoint.trim() || null,
          provider: selectedProvider?.id ?? null,
          model: modelValue || null,
          apiKey: (selectedProvider?.needsKey && form.apiKey.trim()) ? form.apiKey.trim() : null,
        },
      });
      onCreated();
      handleClose();
    } catch {
      setError("Failed to add agent. Please check your inputs.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2 text-sm">
            <Plug className="w-4 h-4 text-primary" />
            {step === 1 ? "Add Agent" : (
              <button onClick={() => { setStep(1); setError(""); }} className="flex items-center gap-1 hover:text-primary transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
                AI Model
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Agent identity ── */}
        {step === 1 && (
          <div className="space-y-5 pt-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your agent is a standalone process — give it an identity and optionally its bridge endpoint.
              You'll configure its AI model on the next step.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Name *</Label>
                <Input
                  placeholder="e.g. Nova"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Role *</Label>
                <Input
                  placeholder="e.g. Research Assistant"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Department *</Label>
              <Select value={form.department} onValueChange={v => setForm(f => ({ ...f, department: v as typeof DEPARTMENTS[number] }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">
                Bridge Endpoint <span className="normal-case text-muted-foreground/60">(optional)</span>
              </Label>
              <Input
                placeholder="https://your-agent.example.com/dispatch"
                value={form.endpoint}
                onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))}
                className="h-9 text-sm font-mono"
              />
              <p className="text-[11px] text-muted-foreground/60">The URL Mission Control will POST to when dispatching instructions.</p>
            </div>

            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button size="sm" onClick={handleStep1Next} className="gap-2">
                Next: AI Model
                <ChevronLeft className="w-3 h-3 rotate-180" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: AI model (optional) ── */}
        {step === 2 && (
          <div className="space-y-5 pt-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Which AI model does <span className="text-foreground font-medium">{form.name}</span> use internally?
              This is optional — you can skip if the agent manages its own model or you'll configure it later.
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">AI Provider</Label>
              <Select value={form.provider} onValueChange={handleProviderChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a provider…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROVIDER}>
                    <span className="text-muted-foreground">None / configure later</span>
                  </SelectItem>
                  {PROVIDERS.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex w-5 h-5 rounded text-[9px] font-bold items-center justify-center bg-gradient-to-br ${p.color} text-white`}>{p.initials}</span>
                        {p.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProvider && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Model</Label>
                  {selectedProvider.models.length > 0 ? (
                    <Select value={form.model} onValueChange={v => setForm(f => ({ ...f, model: v }))}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProvider.models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="e.g. gpt-4o, claude-3-5-sonnet…"
                      value={form.customModel}
                      onChange={e => setForm(f => ({ ...f, customModel: e.target.value }))}
                      className="h-9 text-sm font-mono"
                    />
                  )}
                </div>

                {selectedProvider.needsEndpoint && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase text-muted-foreground">Provider Endpoint</Label>
                    <Input
                      placeholder={selectedProvider.endpointPlaceholder}
                      value={form.modelEndpoint}
                      onChange={e => setForm(f => ({ ...f, modelEndpoint: e.target.value }))}
                      className="h-9 text-sm font-mono"
                    />
                  </div>
                )}

                {selectedProvider.needsKey && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase text-muted-foreground">API Key</Label>
                    <div className="relative">
                      <Input
                        type={showKey ? "text" : "password"}
                        placeholder={selectedProvider.keyPlaceholder}
                        value={form.apiKey}
                        onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                        className="h-9 text-sm font-mono pr-10"
                      />
                      <button type="button" onClick={() => setShowKey(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60">Stored securely in this workspace only.</p>
                  </div>
                )}
              </>
            )}

            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}

            <div className="flex justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={handleSubmit} disabled={createAgent.isPending}
                className="text-muted-foreground text-xs gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {createAgent.isPending ? "Adding…" : "Skip & Add Agent"}
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
                <Button size="sm" onClick={handleSubmit} disabled={createAgent.isPending || form.provider === NO_PROVIDER} className="gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {createAgent.isPending ? "Adding…" : "Add Agent"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Team() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const updateAgent = useUpdateAgent();

  const { data: agents, isLoading } = useListAgents();

  const leadAgent = agents?.find(a => a.isLead);
  const subAgents = agents?.filter(a => !a.isLead) ?? [];

  const byDepartment = (dept: string) => subAgents.filter(a => a.department === dept);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });

  const handleDisconnect = async (agent: Agent) => {
    await updateAgent.mutateAsync({ id: agent.id, data: { isPluggedIn: false, provider: null, model: null, apiKey: null, endpoint: null } });
    invalidate();
    setSelectedAgent(null);
  };

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="workspaces-canvas flex-1 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="workspace-eyebrow">Agent Team</p>
            <h1 className="mt-2 text-5xl font-medium leading-none tracking-[-0.07em] md:text-6xl">Mission Control agent team.</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Team contains agents. Orchestrator is a role assigned to the current agent, not a separate product area. Default current orchestrator: James.</p>
          </div>
          <Button size="sm" onClick={() => setShowConnect(true)} className="gap-2 text-xs">
            <Plug className="w-3.5 h-3.5" />
            Plug In Agent
          </Button>
        </header>


        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CORE_AGENT_TEAM.map((agent) => <CoreAgentCard key={agent.name} agent={agent} />)}
        </section>

        <section className="workspace-panel p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="workspace-eyebrow">Orchestrator role</p>
              <h2 className="dashboard-section-title mt-1 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Chat with current Orchestrator</h2>
              <p className="mt-2 text-xs text-muted-foreground">Current orchestrator is whichever agent has role = Orchestrator. Current agent: {CURRENT_ORCHESTRATOR_AGENT.name}.</p>
            </div>
            <Badge className="font-mono text-[10px] uppercase">{CURRENT_ORCHESTRATOR_AGENT.role}: {CURRENT_ORCHESTRATOR_AGENT.name}</Badge>
          </div>
          <James embedded />
        </section>

        <section className="space-y-4">
          <div>
            <p className="workspace-eyebrow">Connected agents</p>
            <h2 className="dashboard-section-title mt-1">Configurable bridge agents</h2>
          </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full max-w-sm" />
            {DEPARTMENTS.map(d => (
              <div key={d} className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[1, 2].map(i => <Skeleton key={i} className="h-28 w-full" />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {leadAgent && (
              <div className="flex flex-col items-center">
                <div
                  className="bg-card border border-primary/30 rounded-xl p-6 w-80 cursor-pointer hover:border-primary/60 transition-colors text-center"
                  onClick={() => setSelectedAgent(leadAgent)}
                >
                  <div className="flex justify-center mb-3">
                    <AgentAvatar initials={leadAgent.avatarInitials} isLead status={leadAgent.status} />
                  </div>
                  <h2 className="font-mono font-bold text-lg text-primary">{leadAgent.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{leadAgent.role}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-3">
                    <div className={`w-2 h-2 rounded-full ${STATUS_DOT[leadAgent.status] ?? "bg-muted-foreground"}`} />
                    <span className={`text-xs font-mono capitalize ${STATUS_LABEL[leadAgent.status] ?? ""}`}>{leadAgent.status}</span>
                  </div>
                  {leadAgent.currentTask && (
                    <p className="text-xs text-muted-foreground mt-2 font-mono">{leadAgent.currentTask}</p>
                  )}
                </div>
                <div className="w-px h-8 bg-border" />
              </div>
            )}

            {DEPARTMENTS.map(dept => {
              const deptAgents = byDepartment(dept);
              if (!deptAgents.length) return null;
              return (
                <div key={dept}>
                  <h3 className="font-mono text-xs uppercase text-muted-foreground mb-3 flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span>{dept}</span>
                    <div className="flex-1 h-px bg-border" />
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {deptAgents.map(agent => (
                      <div
                        key={agent.id}
                        className={`bg-card border rounded-lg p-4 cursor-pointer transition-colors ${agent.isPluggedIn ? "border-primary/30 hover:border-primary/60" : "border-border hover:border-primary/50"}`}
                        onClick={() => setSelectedAgent(agent)}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <AgentAvatar initials={agent.avatarInitials} status={agent.status} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-sm">{agent.name}</p>
                              {agent.isPluggedIn && agent.provider && (
                                <ProviderBadge provider={agent.provider} />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                          </div>
                        </div>
                        {agent.isPluggedIn && agent.model && (
                          <p className="text-xs text-primary/60 font-mono truncate mb-1">{agent.model}</p>
                        )}
                        {agent.currentTask ? (
                          <p className="text-xs text-muted-foreground font-mono truncate">{agent.currentTask}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground/50 font-mono">Idle</p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs text-muted-foreground/50 font-mono">{agent.lastActive}</p>
                          {agent.isPluggedIn && agent.endpoint && (
                            <div className="flex items-center gap-1">
                              <div className={`w-1.5 h-1.5 rounded-full ${isOnline(agent.lastPing) ? "bg-green-400" : "bg-muted-foreground/30"}`} />
                              <span className="text-[10px] font-mono text-muted-foreground">{isOnline(agent.lastPing) ? "live" : "off"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => setShowConnect(true)}
                      className="border border-dashed border-border hover:border-primary/40 rounded-lg p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors min-h-[108px]"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="text-xs font-mono">Add Agent</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {subAgents.length === 0 && !leadAgent && (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                <Plug className="w-12 h-12 opacity-20" />
                <p className="text-sm">No agents connected yet.</p>
                <Button size="sm" onClick={() => setShowConnect(true)} className="gap-2">
                  <Plug className="w-3.5 h-3.5" />
                  Plug In Your First Agent
                </Button>
              </div>
            )}
          </>
        )}
        </section>
      </div>

      <Dialog open={!!selectedAgent} onOpenChange={o => !o && setSelectedAgent(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-3">
              <AgentAvatar initials={selectedAgent?.avatarInitials ?? ""} status={selectedAgent?.status ?? "idle"} isLead={selectedAgent?.isLead} />
              <div>
                <div className="flex items-center gap-2">
                  {selectedAgent?.name}
                  {selectedAgent?.isPluggedIn && selectedAgent?.provider && (
                    <ProviderBadge provider={selectedAgent.provider} />
                  )}
                </div>
                <div className="text-sm font-normal text-muted-foreground">{selectedAgent?.role}</div>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedAgent && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Department</label>
                  <p className="mt-1">{selectedAgent.department}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Status</label>
                  <p className={`mt-1 capitalize font-mono ${STATUS_LABEL[selectedAgent.status] ?? ""}`}>{selectedAgent.status}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Tasks Completed</label>
                  <p className="mt-1 font-mono">{selectedAgent.tasksCompleted}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Last Active</label>
                  <p className="mt-1 font-mono text-xs">{selectedAgent.lastActive}</p>
                </div>
              </div>

              {selectedAgent.isPluggedIn && (
                <div className="bg-secondary/50 rounded-lg p-3 space-y-2 border border-primary/20">
                  <p className="text-xs font-mono uppercase text-primary">Plugged-In Connection</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Provider</span>
                      <p className="font-mono mt-0.5 capitalize">{selectedAgent.provider ?? "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Model</span>
                      <p className="font-mono mt-0.5">{selectedAgent.model ?? "—"}</p>
                    </div>
                    {selectedAgent.apiKeyHint && (
                      <div>
                        <span className="text-muted-foreground">API Key</span>
                        <p className="font-mono mt-0.5">{selectedAgent.apiKeyHint}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedAgent.isPluggedIn && (
                <BridgeSection agent={selectedAgent} onTokenRefreshed={invalidate} />
              )}

              <div>
                <label className="text-xs text-muted-foreground font-mono uppercase">Success Rate</label>
                <div className="flex items-center gap-3 mt-2">
                  <Progress value={selectedAgent.successRate} className="flex-1 h-2" />
                  <span className="text-xs font-mono text-primary">{selectedAgent.successRate}%</span>
                </div>
              </div>
              {selectedAgent.currentTask && (
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Current Task</label>
                  <p className="mt-1 text-muted-foreground">{selectedAgent.currentTask}</p>
                </div>
              )}
              {selectedAgent.responsibilities && (
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Responsibilities</label>
                  <p className="mt-1 text-muted-foreground leading-relaxed">{selectedAgent.responsibilities}</p>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground font-mono uppercase">Assigned Apps</label>
                <div className="mt-2">
                  <AgentAssignedApps agentId={selectedAgent.id} />
                </div>
              </div>

              {selectedAgent.isPluggedIn && (
                <div className="flex justify-end pt-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5"
                    onClick={() => handleDisconnect(selectedAgent)}
                    disabled={updateAgent.isPending}
                  >
                    <Trash2 className="w-3 h-3" />
                    Disconnect Agent
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConnectAgentDialog
        open={showConnect}
        onClose={() => setShowConnect(false)}
        onCreated={invalidate}
      />
    </div>
  );
}
