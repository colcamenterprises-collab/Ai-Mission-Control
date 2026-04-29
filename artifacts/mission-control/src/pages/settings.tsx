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
} from "@workspace/api-client-react";
import type { Integration } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plug, Wifi, WifiOff, Plus, Trash2, Users, ExternalLink, X, Check, ChevronRight, Cpu } from "lucide-react";
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
          {/* Assigned agents */}
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
                      <p className="text-sm font-medium">{a.agentName}</p>
                      {a.role && <p className="text-xs text-muted-foreground">{a.role}</p>}
                    </div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[a.agentStatus] ?? "bg-muted-foreground"}`} />
                    <button
                      onClick={() => handleUnassign(a.agentId)}
                      className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                      disabled={unassignMut.isPending}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Assign new agent */}
          <div>
            <p className="text-xs font-mono uppercase text-muted-foreground mb-2">Assign Agent</p>
            {availableAgents.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">All agents are already assigned.</p>
            ) : (
              <div className="space-y-2">
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select agent…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgents.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-primary">{a.avatarInitials}</span>
                          <span>{a.name}</span>
                          <span className="text-muted-foreground text-xs">— {a.role}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Agent role for this app (optional)"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="h-9 text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleAssign}
                  disabled={!selectedAgentId || assignMut.isPending}
                  className="w-full gap-2"
                >
                  <Check className="w-3.5 h-3.5" />
                  {assignMut.isPending ? "Assigning…" : "Assign Agent"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ConnectAppDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function ConnectAppDialog({ open, onClose, onCreated }: ConnectAppDialogProps) {
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
            <p className="text-xs text-muted-foreground">Replit apps, any web app, or custom endpoint</p>
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

          {form.name && (
            <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-lg">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${CATEGORY_COLORS[form.category] ?? "from-slate-600 to-slate-800"} flex items-center justify-center`}>
                <span className="font-mono text-xs font-bold text-white">{initials(form.name)}</span>
              </div>
              <div>
                <p className="text-sm font-medium">{form.name || "App name"}</p>
                <p className="text-xs text-muted-foreground capitalize">{CATEGORIES.find(c => c.value === form.category)?.label}</p>
              </div>
            </div>
          )}

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
          <a href={integration.url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
              <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
            onClick={() => onDelete(integration)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [cronJobs, setCronJobs] = useState(CRON_JOBS);
  const [config, setConfig] = useState(AGENT_CONFIG);
  const [showConnect, setShowConnect] = useState(false);
  const [managingIntegration, setManagingIntegration] = useState<Integration | null>(null);
  const [, navigate] = useLocation();

  const { data: integrations, isLoading: intLoading } = useListIntegrations();
  const { data: agents } = useListAgents();
  const deleteMut = useDeleteIntegration();

  const pluggedAgents = agents?.filter(a => a.isPluggedIn && a.provider) ?? [];

  const invalidateIntegrations = () =>
    queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });

  const handleDelete = async (integration: Integration) => {
    if (!confirm(`Disconnect "${integration.name}"?`)) return;
    await deleteMut.mutateAsync({ id: integration.id });
    invalidateIntegrations();
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
                className="h-44 border border-dashed border-border hover:border-primary/40 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors"
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

      <ConnectAppDialog
        open={showConnect}
        onClose={() => setShowConnect(false)}
        onCreated={invalidateIntegrations}
      />

      {managingIntegration && (
        <ManageAgentsDialog
          integration={managingIntegration}
          onClose={() => setManagingIntegration(null)}
        />
      )}
    </div>
  );
}
