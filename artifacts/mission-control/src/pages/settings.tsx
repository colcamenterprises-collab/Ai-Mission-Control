import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useListAgents,
  useListIntegrations,
  useCreateIntegration,
  useDeleteIntegration,
  useAssignAgentToIntegration,
  useUnassignAgentFromIntegration,
  useGetIntegration,
  getListIntegrationsQueryKey,
  useListTools,
  useCreateTool,
  useDeleteTool,
  useGrantToolAccess,
  useRevokeToolAccess,
  useListToolAgents,
  getListToolsQueryKey,
} from "@workspace/api-client-react";
import type { Integration, Tool } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plug, Plus, Trash2, Users, ExternalLink, X, Check, ChevronRight, Cpu,
  KeyRound, User, Lock, Globe, ShieldCheck, Eye, EyeOff,
} from "lucide-react";
import { useLocation } from "wouter";

const CRON_JOBS = [
  { id: 1, name: "Daily Agent Briefing", schedule: "0 8 * * *", description: "Generate daily summary at 8am", enabled: true, lastRun: "Today 08:00", status: "active" as const },
  { id: 2, name: "Content Distribution", schedule: "0 9 * * 1-5", description: "Publish scheduled content weekdays at 9am", enabled: true, lastRun: "Today 09:00", status: "active" as const },
  { id: 3, name: "Email Sequence", schedule: "0 10 * * *", description: "Process onboarding email queue", enabled: true, lastRun: "Today 10:00", status: "active" as const },
  { id: 4, name: "Performance Report", schedule: "0 18 * * 5", description: "Weekly analytics report every Friday at 6pm", enabled: false, lastRun: "Last Friday 18:00", status: "idle" as const },
  { id: 5, name: "Memory Backup", schedule: "0 0 * * *", description: "Backup all memory documents at midnight", enabled: true, lastRun: "Yesterday 00:00", status: "idle" as const },
];

const AGENT_CONFIG = [
  { key: "MAX_CONCURRENT_TASKS", value: "5", description: "Maximum tasks ATLAS can run in parallel" },
  { key: "DEFAULT_PRIORITY", value: "medium", description: "Default task priority when unspecified" },
  { key: "BRIEFING_TIME", value: "08:00", description: "Time for daily executive briefing" },
  { key: "CONTENT_REVIEW_WINDOW", value: "24h", description: "Time window for content review before publishing" },
  { key: "ERROR_ESCALATION_THRESHOLD", value: "3", description: "Failed retries before escalating to human" },
];

const STATUS_DOT: Record<string, string> = {
  active: "bg-primary shadow-[0_0_8px_rgba(0,212,255,0.8)]",
  pending: "bg-yellow-500",
  idle: "bg-muted-foreground",
  error: "bg-red-500",
};

const CATEGORIES = [
  { value: "dashboard", label: "Dashboard" },
  { value: "crm", label: "CRM" },
  { value: "analytics", label: "Analytics" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "social", label: "Social Media" },
  { value: "productivity", label: "Productivity" },
  { value: "devtools", label: "Dev Tools" },
  { value: "custom", label: "Custom App" },
];

const TOOL_CATEGORIES = [
  { value: "api", label: "REST / GraphQL API" },
  { value: "cms", label: "CMS" },
  { value: "crm", label: "CRM" },
  { value: "social", label: "Social Media" },
  { value: "email", label: "Email" },
  { value: "database", label: "Database" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "devtools", label: "Dev Tools" },
  { value: "custom", label: "Custom" },
];

const CRED_TYPES = [
  { value: "api_key", label: "API Key", icon: KeyRound },
  { value: "basic_auth", label: "Username + Password", icon: User },
  { value: "bearer_token", label: "Bearer Token", icon: ShieldCheck },
  { value: "custom", label: "Custom / Other", icon: Lock },
];

const TOOL_CATEGORY_COLORS: Record<string, string> = {
  api: "from-cyan-600 to-cyan-800",
  cms: "from-violet-600 to-violet-800",
  crm: "from-purple-600 to-purple-800",
  social: "from-pink-600 to-pink-800",
  email: "from-blue-600 to-blue-800",
  database: "from-emerald-600 to-emerald-800",
  ecommerce: "from-amber-600 to-amber-800",
  devtools: "from-slate-600 to-slate-800",
  custom: "from-rose-600 to-rose-800",
};

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

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "AP";
}

function credLabel(type: string) {
  return CRED_TYPES.find(c => c.value === type)?.label ?? type;
}

function credIcon(type: string) {
  const found = CRED_TYPES.find(c => c.value === type);
  if (!found) return KeyRound;
  return found.icon;
}

/* ─── Manage Agents Dialog (for App Connections) ─────────────── */
interface ManageAgentsDialogProps {
  integration: Integration;
  onClose: () => void;
}

function ManageAgentsDialog({ integration, onClose }: ManageAgentsDialogProps) {
  const queryClient = useQueryClient();
  const { data: allAgents } = useListAgents();
  const { data: detail, refetch } = useGetIntegration(integration.id);
  const assignMut = useAssignAgentToIntegration();
  const unassignMut = useUnassignAgentFromIntegration();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [role, setRole] = useState("");

  const assignedIds = new Set(detail?.agents?.map(a => a.agentId) ?? []);
  const availableAgents = allAgents?.filter(a => !assignedIds.has(a.id)) ?? [];

  const handleAssign = async () => {
    if (!selectedAgentId) return;
    await assignMut.mutateAsync({
      id: integration.id,
      data: { agentId: parseInt(selectedAgentId), role: role || null },
    });
    setSelectedAgentId("");
    setRole("");
    refetch();
    queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });
  };

  const handleUnassign = async (agentId: number) => {
    await unassignMut.mutateAsync({ id: integration.id, agentId });
    refetch();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${CATEGORY_COLORS[integration.category] ?? "from-slate-600 to-slate-800"} flex items-center justify-center flex-shrink-0`}>
              <span className="font-mono text-xs font-bold text-white">{integration.iconInitials}</span>
            </div>
            <div>
              <div className="text-sm">{integration.name}</div>
              <div className="text-xs font-normal text-muted-foreground">Manage Assigned Agents</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-mono uppercase text-muted-foreground mb-2">Assigned Agents ({detail?.agents?.length ?? 0})</p>
            {!detail?.agents?.length ? (
              <p className="text-xs text-muted-foreground/60 py-3 text-center border border-dashed border-border rounded-lg">No agents assigned yet</p>
            ) : (
              <div className="space-y-2">
                {detail.agents.map(a => (
                  <div key={a.agentId} className="flex items-center gap-3 p-2.5 bg-secondary/40 rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-border flex items-center justify-center flex-shrink-0">
                      <span className="font-mono text-xs text-primary">{a.agentAvatarInitials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.agentName}</p>
                      {a.role && <p className="text-xs text-muted-foreground truncate">{a.role}</p>}
                    </div>
                    <button onClick={() => handleUnassign(a.agentId)} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {availableAgents.length > 0 && (
            <div>
              <p className="text-xs font-mono uppercase text-muted-foreground mb-2">Add Agent</p>
              <div className="flex gap-2">
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Select agent…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgents.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Role (optional)"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="h-8 text-xs w-32"
                />
                <Button size="sm" className="h-8 text-xs gap-1" onClick={handleAssign} disabled={!selectedAgentId || assignMut.isPending}>
                  <Check className="w-3 h-3" />
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Manage Tool Agents Dialog ──────────────────────────────── */
function ManageToolAgentsDialog({ tool, onClose }: { tool: Tool; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: allAgents } = useListAgents();
  const { data: assignedAgents, refetch } = useListToolAgents(tool.id);
  const grantMut = useGrantToolAccess();
  const revokeMut = useRevokeToolAccess();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

  const assignedIds = new Set(assignedAgents?.map(a => a.agentId) ?? []);
  const available = allAgents?.filter(a => !assignedIds.has(a.id)) ?? [];

  const handleGrant = async () => {
    if (!selectedAgentId) return;
    await grantMut.mutateAsync({ id: tool.id, data: { agentId: parseInt(selectedAgentId) } });
    setSelectedAgentId("");
    refetch();
    queryClient.invalidateQueries({ queryKey: getListToolsQueryKey() });
  };

  const handleRevoke = async (agentId: number) => {
    await revokeMut.mutateAsync({ id: tool.id, agentId });
    refetch();
  };

  const CredIcon = credIcon(tool.credentialType);

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${TOOL_CATEGORY_COLORS[tool.category] ?? "from-slate-600 to-slate-800"} flex items-center justify-center flex-shrink-0`}>
              <CredIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-sm">{tool.name}</div>
              <div className="text-xs font-normal text-muted-foreground">Agent Access Control</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-secondary/30 rounded-lg border border-border text-xs font-mono space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-20">Type</span>
              <span className="text-primary">{credLabel(tool.credentialType)}</span>
            </div>
            {tool.apiKeyHint && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Key</span>
                <span>{tool.apiKeyHint}</span>
              </div>
            )}
            {tool.usernameHint && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Username</span>
                <span>{tool.usernameHint}</span>
              </div>
            )}
            {tool.passwordHint && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Password</span>
                <span>{tool.passwordHint}</span>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-mono uppercase text-muted-foreground mb-2">
              Agents with access ({assignedAgents?.length ?? 0})
            </p>
            {!assignedAgents?.length ? (
              <p className="text-xs text-muted-foreground/60 py-3 text-center border border-dashed border-border rounded-lg">
                No agents have access yet
              </p>
            ) : (
              <div className="space-y-2">
                {assignedAgents.map(a => (
                  <div key={a.agentId} className="flex items-center gap-3 p-2.5 bg-secondary/40 rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-border flex items-center justify-center flex-shrink-0">
                      <span className="font-mono text-xs text-primary">{a.agentAvatarInitials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.agentName}</p>
                      <p className="text-xs text-muted-foreground">Access granted</p>
                    </div>
                    <button onClick={() => handleRevoke(a.agentId)} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {available.length > 0 && (
            <div>
              <p className="text-xs font-mono uppercase text-muted-foreground mb-2">Grant Access</p>
              <div className="flex gap-2">
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Select agent…" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs gap-1" onClick={handleGrant} disabled={!selectedAgentId || grantMut.isPending}>
                  <Check className="w-3 h-3" />
                  Grant
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Add Tool Dialog ────────────────────────────────────────── */
function AddToolDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const createMut = useCreateTool();
  const [step, setStep] = useState(1);
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "api",
    credentialType: "api_key",
    url: "",
    description: "",
    apiKey: "",
    username: "",
    password: "",
    notes: "",
  });
  const [error, setError] = useState("");

  const reset = () => {
    setForm({ name: "", category: "api", credentialType: "api_key", url: "", description: "", apiKey: "", username: "", password: "", notes: "" });
    setStep(1);
    setError("");
    setShowSecret(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError("Tool name is required."); return; }
    if (form.credentialType === "api_key" && !form.apiKey.trim()) { setError("API key is required."); return; }
    if (form.credentialType === "bearer_token" && !form.apiKey.trim()) { setError("Bearer token is required."); return; }
    if (form.credentialType === "basic_auth" && (!form.username.trim() || !form.password.trim())) {
      setError("Username and password are required."); return;
    }
    setError("");
    try {
      await createMut.mutateAsync({
        data: {
          name: form.name.trim(),
          category: form.category as Parameters<typeof createMut.mutateAsync>[0]["data"]["category"],
          credentialType: form.credentialType as Parameters<typeof createMut.mutateAsync>[0]["data"]["credentialType"],
          url: form.url.trim() || null,
          description: form.description.trim() || null,
          apiKey: form.apiKey.trim() || null,
          username: form.username.trim() || null,
          password: form.password.trim() || null,
          notes: form.notes.trim() || null,
        },
      });
      onCreated();
      handleClose();
    } catch {
      setError("Failed to save tool. Please try again.");
    }
  };

  const CredIcon = credIcon(form.credentialType);

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            Add Tool to Vault
            <Badge variant="outline" className="text-xs ml-auto font-mono">{step}/2</Badge>
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Tool Name *</Label>
              <Input
                placeholder="e.g. Shopify Admin, Mailchimp, Airtable"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="h-9 text-sm"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOOL_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Tool URL (optional)</Label>
              <Input
                placeholder="https://api.yourtool.com"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                className="h-9 text-sm font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Description (optional)</Label>
              <Textarea
                placeholder="What does this tool do? Any notes for the agent?"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="text-sm resize-none h-20"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button size="sm" onClick={() => setStep(2)} disabled={!form.name.trim()} className="gap-2">
                Next: Credentials
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Credential Type *</Label>
              <div className="grid grid-cols-2 gap-2">
                {CRED_TYPES.map(ct => {
                  const Icon = ct.icon;
                  return (
                    <button
                      key={ct.value}
                      onClick={() => setForm(f => ({ ...f, credentialType: ct.value }))}
                      className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-colors text-sm ${
                        form.credentialType === ct.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="text-xs font-medium">{ct.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {(form.credentialType === "api_key" || form.credentialType === "bearer_token") && (
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">
                  {form.credentialType === "bearer_token" ? "Bearer Token *" : "API Key *"}
                </Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    placeholder={form.credentialType === "bearer_token" ? "eyJ…" : "sk-…"}
                    value={form.apiKey}
                    onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    className="h-9 text-sm font-mono pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {form.credentialType === "basic_auth" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Username *</Label>
                  <Input
                    placeholder="admin@example.com"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Password *</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="h-9 text-sm font-mono pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(s => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {form.credentialType === "custom" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Credential / Secret</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    placeholder="Any secret value"
                    value={form.apiKey}
                    onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    className="h-9 text-sm font-mono pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Notes for Agent (optional)</Label>
              <Textarea
                placeholder="Rate limits, quirks, specific endpoints the agent should know about…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="text-sm resize-none h-16"
              />
            </div>

            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Credentials are stored server-side and only returned to authenticated agents via their bearer token. The UI only shows masked hints.
              </p>
            </div>

            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}

            <div className="flex justify-between gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep(1)} className="gap-1">
                ← Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
                <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending} className="gap-2">
                  <KeyRound className="w-3.5 h-3.5" />
                  {createMut.isPending ? "Saving…" : "Save to Vault"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Tool Card ──────────────────────────────────────────────── */
function ToolCard({ tool, onManageAgents, onDelete }: {
  tool: Tool;
  onManageAgents: (t: Tool) => void;
  onDelete: (t: Tool) => void;
}) {
  const color = TOOL_CATEGORY_COLORS[tool.category] ?? "from-slate-600 to-slate-800";
  const CredIcon = credIcon(tool.credentialType);
  const { data: agents } = useListToolAgents(tool.id);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors group">
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0`}>
            <CredIcon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{tool.name}</p>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tool.isActive ? "bg-green-500" : "bg-muted-foreground/40"}`} />
            </div>
            <Badge className="text-xs px-1.5 py-0 mt-0.5 capitalize bg-secondary text-muted-foreground border-0">
              {credLabel(tool.credentialType)}
            </Badge>
          </div>
        </div>

        {tool.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{tool.description}</p>
        )}

        <div className="space-y-1 mb-3">
          {tool.apiKeyHint && (
            <div className="flex items-center gap-2">
              <KeyRound className="w-3 h-3 text-muted-foreground/50" />
              <code className="text-xs text-muted-foreground font-mono">{tool.apiKeyHint}</code>
            </div>
          )}
          {tool.usernameHint && (
            <div className="flex items-center gap-2">
              <User className="w-3 h-3 text-muted-foreground/50" />
              <code className="text-xs text-muted-foreground font-mono">{tool.usernameHint}</code>
            </div>
          )}
          {tool.url && (
            <div className="flex items-center gap-2">
              <Globe className="w-3 h-3 text-muted-foreground/50" />
              <a href={tool.url} target="_blank" rel="noreferrer" className="text-xs text-primary/60 hover:text-primary font-mono truncate flex items-center gap-1">
                {tool.url.replace(/^https?:\/\//, "").slice(0, 30)}
                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
              </a>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs gap-1.5 h-7"
            onClick={() => onManageAgents(tool)}
          >
            <Users className="w-3 h-3" />
            Agents ({agents?.length ?? 0})
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:border-red-400/50"
            onClick={() => onDelete(tool)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Integration Card ───────────────────────────────────────── */
function IntegrationCard({ integration, onManageAgents, onDelete }: {
  integration: Integration;
  onManageAgents: (i: Integration) => void;
  onDelete: (i: Integration) => void;
}) {
  const color = CATEGORY_COLORS[integration.category] ?? "from-slate-600 to-slate-800";
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors group">
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0`}>
            <span className="font-mono text-sm font-bold text-white">{integration.iconInitials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{integration.name}</p>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${integration.status === "connected" ? "bg-green-500" : integration.status === "error" ? "bg-red-500" : "bg-muted-foreground/40"}`} />
            </div>
            <Badge className="text-xs px-1.5 py-0 mt-0.5 capitalize bg-secondary text-muted-foreground border-0">
              {CATEGORIES.find(c => c.value === integration.category)?.label ?? integration.category}
            </Badge>
          </div>
        </div>

        {integration.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{integration.description}</p>
        )}

        <p className="text-xs text-muted-foreground/50 font-mono truncate mb-4">{integration.url}</p>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs gap-1.5 h-7"
            onClick={() => onManageAgents(integration)}
          >
            <Users className="w-3 h-3" />
            Agents
          </Button>
          <a href={integration.url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
              <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:border-red-400/50"
            onClick={() => onDelete(integration)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── ConnectAppDialog ───────────────────────────────────────── */
function ConnectAppDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const createMut = useCreateIntegration();
  const [form, setForm] = useState({
    name: "",
    url: "",
    description: "",
    category: "custom",
    apiKey: "",
    isPublic: false,
  });
  const [error, setError] = useState("");

  const reset = () => {
    setForm({ name: "", url: "", description: "", category: "custom", apiKey: "", isPublic: false });
    setError("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError("App name is required."); return; }
    if (!form.url.trim()) { setError("App URL is required."); return; }
    const urlPattern = /^https?:\/\/.+/;
    if (!urlPattern.test(form.url.trim())) { setError("Enter a valid URL starting with http:// or https://"); return; }
    setError("");
    const ic = initials(form.name);
    const color = CATEGORY_COLORS[form.category] ?? "from-slate-600 to-slate-800";
    try {
      await createMut.mutateAsync({
        data: {
          name: form.name.trim(),
          url: form.url.trim(),
          description: form.description.trim() || null,
          category: form.category as Parameters<typeof createMut.mutateAsync>[0]["data"]["category"],
          iconInitials: ic,
          iconColor: color,
          isPublic: form.isPublic,
          apiKey: form.apiKey.trim() || null,
        },
      });
      onCreated();
      handleClose();
    } catch {
      setError("Failed to connect app. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <Plug className="w-4 h-4 text-primary" />
            Connect App as Tool
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">App Name *</Label>
            <Input
              placeholder="e.g. SBB Dashboard"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">App URL *</Label>
            <Input
              placeholder="https://your-app.replit.app or https://your-domain.com"
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              className="h-9 text-sm font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Category *</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Description</Label>
            <Textarea
              placeholder="What does this app do? What should agents work on?"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="text-sm resize-none h-20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">API Key / Token (optional)</Label>
            <Input
              type="password"
              placeholder="If the app requires authentication"
              value={form.apiKey}
              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              className="h-9 text-sm font-mono"
            />
          </div>

          <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-lg">
            <Switch
              checked={form.isPublic}
              onCheckedChange={v => setForm(f => ({ ...f, isPublic: v }))}
              id="isPublic"
            />
            <div>
              <label htmlFor="isPublic" className="text-sm font-medium cursor-pointer">Publicly accessible</label>
              <p className="text-xs text-muted-foreground">Agents can access this app without credentials</p>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 font-mono">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending} className="gap-2">
              <Plug className="w-3.5 h-3.5" />
              {createMut.isPending ? "Connecting…" : "Connect App"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Settings Page ─────────────────────────────────────── */
export default function Settings() {
  const queryClient = useQueryClient();
  const [cronJobs, setCronJobs] = useState(CRON_JOBS);
  const [config, setConfig] = useState(AGENT_CONFIG);
  const [showConnect, setShowConnect] = useState(false);
  const [managingIntegration, setManagingIntegration] = useState<Integration | null>(null);
  const [showAddTool, setShowAddTool] = useState(false);
  const [managingTool, setManagingTool] = useState<Tool | null>(null);
  const [, navigate] = useLocation();

  const { data: integrations, isLoading: intLoading } = useListIntegrations();
  const { data: tools, isLoading: toolsLoading } = useListTools();
  const { data: agents } = useListAgents();
  const deleteMut = useDeleteIntegration();
  const deleteToolMut = useDeleteTool();

  const pluggedAgents = agents?.filter(a => a.isPluggedIn && a.provider) ?? [];

  const invalidateIntegrations = () =>
    queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });

  const invalidateTools = () =>
    queryClient.invalidateQueries({ queryKey: getListToolsQueryKey() });

  const handleDelete = async (integration: Integration) => {
    if (!confirm(`Disconnect "${integration.name}"?`)) return;
    await deleteMut.mutateAsync({ id: integration.id });
    invalidateIntegrations();
  };

  const handleDeleteTool = async (tool: Tool) => {
    if (!confirm(`Remove "${tool.name}" from the vault? Agents will lose access.`)) return;
    await deleteToolMut.mutateAsync({ id: tool.id });
    invalidateTools();
  };

  const toggleCron = (id: number) => {
    setCronJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: !j.enabled } : j));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-mono font-semibold uppercase tracking-tight">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-10">

        {/* ─── Agent Tool Vault ─── */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-mono text-sm uppercase text-muted-foreground">Agent Tool Vault</h2>
            <div className="flex-1 h-px bg-border" />
            <Button size="sm" onClick={() => setShowAddTool(true)} className="gap-2 text-xs h-7">
              <Plus className="w-3.5 h-3.5" />
              Add Tool
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/60 mb-4">
            Credentials agents use to operate third-party tools — API keys, logins, tokens. Fetched securely at runtime via the agent bridge.
          </p>

          {toolsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-44 bg-card border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !tools?.length ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-10 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
                <KeyRound className="w-7 h-7 text-muted-foreground/30" />
              </div>
              <div>
                <p className="font-medium text-muted-foreground">No tools in vault yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                  Add API keys, logins, or tokens for any third-party tool your agents need to operate.
                </p>
              </div>
              <Button size="sm" onClick={() => setShowAddTool(true)} className="gap-2 text-xs">
                <KeyRound className="w-3.5 h-3.5" />
                Add Your First Tool
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tools.map(t => (
                <ToolCard
                  key={t.id}
                  tool={t}
                  onManageAgents={setManagingTool}
                  onDelete={handleDeleteTool}
                />
              ))}
              <button
                onClick={() => setShowAddTool(true)}
                className="h-full min-h-[160px] border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground/50 hover:text-muted-foreground hover:border-primary/30 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span className="text-xs font-mono">Add Tool</span>
              </button>
            </div>
          )}
        </section>

        <Separator />

        {/* ─── App Connections ─── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-mono text-sm uppercase text-muted-foreground">App Connections</h2>
            <div className="flex-1 h-px bg-border" />
            <Button size="sm" onClick={() => setShowConnect(true)} className="gap-2 text-xs h-7">
              <Plus className="w-3.5 h-3.5" />
              Connect App
            </Button>
          </div>

          {intLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-44 bg-card border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !integrations?.length ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-10 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
                <Plug className="w-7 h-7 text-muted-foreground/30" />
              </div>
              <div>
                <p className="font-medium text-muted-foreground">No apps connected yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                  Connect your Replit apps, dashboards, or any web tool so your AI agents can work on them.
                </p>
              </div>
              <Button size="sm" onClick={() => setShowConnect(true)} className="gap-2 text-xs">
                <Plug className="w-3.5 h-3.5" />
                Connect Your First App
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {integrations.map(i => (
                <IntegrationCard
                  key={i.id}
                  integration={i}
                  onManageAgents={setManagingIntegration}
                  onDelete={handleDelete}
                />
              ))}
              <button
                onClick={() => setShowConnect(true)}
                className="h-full min-h-[160px] border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground/50 hover:text-muted-foreground hover:border-primary/30 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span className="text-xs font-mono">Connect App</span>
              </button>
            </div>
          )}
        </section>

        <Separator />

        {/* ─── AI Providers ─── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-mono text-sm uppercase text-muted-foreground">AI Providers</h2>
            <div className="flex-1 h-px bg-border" />
            <Button size="sm" variant="outline" className="gap-2 text-xs h-7" onClick={() => navigate("/team")}>
              <Plug className="w-3.5 h-3.5" />
              Manage in AI Team
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>

          {pluggedAgents.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-6 flex items-center gap-4">
              <Cpu className="w-8 h-8 text-muted-foreground/20 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">No AI providers plugged in yet.</p>
                <button onClick={() => navigate("/team")} className="text-xs text-primary hover:underline mt-0.5">
                  Go to AI Team to plug in an agent →
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {pluggedAgents.map(a => (
                <div key={a.id} className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-border flex items-center justify-center flex-shrink-0">
                      <span className="font-mono text-xs text-primary">{a.avatarInitials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground truncate capitalize">{a.provider}</p>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-primary/60 truncate">{a.model}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* ─── Cron Jobs ─── */}
        <section>
          <h2 className="font-mono text-sm uppercase text-muted-foreground mb-4 flex items-center gap-2">
            <span>Cron Job Manager</span>
            <div className="flex-1 h-px bg-border ml-2" />
          </h2>
          <div className="space-y-2">
            {cronJobs.map(job => (
              <div key={job.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${job.enabled ? STATUS_DOT[job.status] : "bg-muted-foreground/30"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="font-medium text-sm">{job.name}</p>
                    <code className="text-xs bg-secondary px-2 py-0.5 rounded font-mono text-muted-foreground">{job.schedule}</code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{job.description}</p>
                </div>
                <div className="text-right mr-4">
                  <p className="text-xs text-muted-foreground font-mono">Last run</p>
                  <p className="text-xs font-mono">{job.lastRun}</p>
                </div>
                <Switch checked={job.enabled} onCheckedChange={() => toggleCron(job.id)} />
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* ─── Agent Configuration ─── */}
        <section>
          <h2 className="font-mono text-sm uppercase text-muted-foreground mb-4 flex items-center gap-2">
            <span>Agent Configuration</span>
            <div className="flex-1 h-px bg-border ml-2" />
          </h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {config.map((item, i) => (
              <div key={item.key} className={`flex items-center gap-4 p-4 ${i < config.length - 1 ? "border-b border-border" : ""}`}>
                <div className="flex-1 min-w-0">
                  <code className="text-xs font-mono text-primary">{item.key}</code>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <Input
                  value={item.value}
                  onChange={e => setConfig(prev => prev.map(c => c.key === item.key ? { ...c, value: e.target.value } : c))}
                  className="w-32 h-8 text-xs font-mono text-right"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button size="sm" className="text-xs">Save Configuration</Button>
          </div>
        </section>

      </div>

      <AddToolDialog
        open={showAddTool}
        onClose={() => setShowAddTool(false)}
        onCreated={invalidateTools}
      />
      <ConnectAppDialog
        open={showConnect}
        onClose={() => setShowConnect(false)}
        onCreated={invalidateIntegrations}
      />
      {managingTool && (
        <ManageToolAgentsDialog
          tool={managingTool}
          onClose={() => setManagingTool(null)}
        />
      )}
      {managingIntegration && (
        <ManageAgentsDialog
          integration={managingIntegration}
          onClose={() => setManagingIntegration(null)}
        />
      )}
    </div>
  );
}
