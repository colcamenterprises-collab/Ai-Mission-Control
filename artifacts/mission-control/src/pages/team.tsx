import { useState } from "react";
import {
  useListAgents,
  useCreateAgent,
  useUpdateAgent,
  useListAgentIntegrations,
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plug, Plus, CheckCircle2, Eye, EyeOff, Trash2, ChevronLeft, ExternalLink } from "lucide-react";

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
  model: string;
  apiKey: string;
  endpoint: string;
  customModel: string;
}

function ConnectAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState<ConnectFormState>({
    name: "",
    role: "",
    department: "Operators",
    model: "",
    apiKey: "",
    endpoint: "",
    customModel: "",
  });
  const [error, setError] = useState("");
  const createAgent = useCreateAgent();

  const reset = () => {
    setStep(1);
    setSelectedProvider(null);
    setShowKey(false);
    setForm({ name: "", role: "", department: "Operators", model: "", apiKey: "", endpoint: "", customModel: "" });
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelectProvider = (p: Provider) => {
    setSelectedProvider(p);
    setForm(f => ({ ...f, model: p.models[0] ?? "", endpoint: p.endpointPlaceholder ?? "" }));
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedProvider) return;
    if (!form.name.trim()) { setError("Agent name is required."); return; }
    if (!form.role.trim()) { setError("Role is required."); return; }
    const model = selectedProvider.id === "custom" ? form.customModel : form.model;
    if (!model.trim()) { setError("Model is required."); return; }
    if (selectedProvider.needsKey && !form.apiKey.trim()) { setError("API key is required."); return; }
    if (selectedProvider.needsEndpoint && !form.endpoint.trim()) { setError("Endpoint URL is required."); return; }

    setError("");
    const initials = form.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "AG";

    try {
      await createAgent.mutateAsync({
        data: {
          name: form.name.trim(),
          role: form.role.trim(),
          department: form.department,
          isLead: false,
          avatarInitials: initials,
          isPluggedIn: true,
          provider: selectedProvider.id,
          model: model.trim(),
          apiKey: selectedProvider.needsKey ? form.apiKey.trim() : null,
          endpoint: selectedProvider.needsEndpoint ? form.endpoint.trim() : null,
        },
      });
      onCreated();
      handleClose();
    } catch {
      setError("Failed to connect agent. Please check your inputs.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <Plug className="w-4 h-4 text-primary" />
            {step === 1 ? "Choose AI Provider" : (
              <button onClick={() => setStep(1)} className="flex items-center gap-1 hover:text-primary transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
                {selectedProvider?.name}
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => handleSelectProvider(p)}
                className="text-left bg-secondary hover:bg-primary/10 border border-border hover:border-primary/40 rounded-xl p-4 transition-all group"
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center mb-3`}>
                  <span className="font-mono font-bold text-sm text-white">{p.initials}</span>
                </div>
                <p className="font-medium text-sm group-hover:text-primary transition-colors">{p.name}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">{p.description}</p>
              </button>
            ))}
          </div>
        )}

        {step === 2 && selectedProvider && (
          <div className="space-y-5 pt-2">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r ${selectedProvider.color} bg-opacity-20`}>
              <span className="text-xs font-mono text-white">{selectedProvider.name}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Agent Name *</Label>
                <Input
                  placeholder="e.g. Nova"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="h-9 text-sm"
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

            <div className="grid grid-cols-2 gap-4">
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
                <Label className="text-xs font-mono uppercase text-muted-foreground">Model *</Label>
                {selectedProvider.id === "custom" ? (
                  <Input
                    placeholder="e.g. gpt-4o"
                    value={form.customModel}
                    onChange={e => setForm(f => ({ ...f, customModel: e.target.value }))}
                    className="h-9 text-sm"
                  />
                ) : (
                  <Select value={form.model} onValueChange={v => setForm(f => ({ ...f, model: v }))}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedProvider.models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {selectedProvider.needsEndpoint && (
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Endpoint URL *</Label>
                <Input
                  placeholder={selectedProvider.endpointPlaceholder}
                  value={form.endpoint}
                  onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))}
                  className="h-9 text-sm font-mono"
                />
              </div>
            )}

            {selectedProvider.needsKey && (
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">API Key *</Label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder={selectedProvider.keyPlaceholder}
                    value={form.apiKey}
                    onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    className="h-9 text-sm font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Your key is stored securely in this workspace only.</p>
              </div>
            )}

            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={createAgent.isPending}
                className="gap-2"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {createAgent.isPending ? "Connecting..." : "Connect Agent"}
              </Button>
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
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-mono font-semibold uppercase tracking-tight">AI Team</h1>
        <Button size="sm" onClick={() => setShowConnect(true)} className="gap-2 text-xs">
          <Plug className="w-3.5 h-3.5" />
          Plug In Agent
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
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
                        <p className="text-xs text-muted-foreground/50 font-mono mt-2">{agent.lastActive}</p>
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
                    {selectedAgent.endpoint && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Endpoint</span>
                        <p className="font-mono mt-0.5 truncate">{selectedAgent.endpoint}</p>
                      </div>
                    )}
                  </div>
                </div>
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
