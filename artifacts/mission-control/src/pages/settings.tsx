import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useListAgents } from "@workspace/api-client-react";
import { Plug, Wifi, WifiOff } from "lucide-react";
import { useLocation } from "wouter";

const CRON_JOBS = [
  { id: 1, name: "Daily Agent Briefing", schedule: "0 8 * * *", description: "Generate daily summary at 8am", enabled: true, lastRun: "Today 08:00", status: "active" as const },
  { id: 2, name: "Content Distribution", schedule: "0 9 * * 1-5", description: "Publish scheduled content weekdays at 9am", enabled: true, lastRun: "Today 09:00", status: "active" as const },
  { id: 3, name: "Email Sequence", schedule: "0 10 * * *", description: "Process onboarding email queue", enabled: true, lastRun: "Today 10:00", status: "active" as const },
  { id: 4, name: "Performance Report", schedule: "0 18 * * 5", description: "Weekly analytics report every Friday at 6pm", enabled: false, lastRun: "Last Friday 18:00", status: "idle" as const },
  { id: 5, name: "Memory Backup", schedule: "0 0 * * *", description: "Backup all memory documents at midnight", enabled: true, lastRun: "Yesterday 00:00", status: "idle" as const },
];

const INTEGRATIONS = [
  { name: "Slack", status: "connected", icon: "SL", description: "Notifications and team communication" },
  { name: "Notion", status: "connected", icon: "NT", description: "Documentation and knowledge base sync" },
  { name: "GitHub", status: "connected", icon: "GH", description: "Code repository and CI/CD pipeline" },
  { name: "YouTube", status: "disconnected", icon: "YT", description: "Video publishing automation" },
  { name: "Twitter / X", status: "disconnected", icon: "TX", description: "Social media post scheduling" },
  { name: "LinkedIn", status: "connected", icon: "LI", description: "Professional content publishing" },
  { name: "ConvertKit", status: "disconnected", icon: "CK", description: "Email list and newsletter management" },
  { name: "Zapier", status: "connected", icon: "ZP", description: "Cross-app automation workflows" },
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

const PROVIDER_COLORS: Record<string, string> = {
  openai: "from-emerald-600 to-emerald-800",
  anthropic: "from-orange-600 to-orange-800",
  gemini: "from-blue-600 to-blue-800",
  groq: "from-purple-600 to-purple-800",
  mistral: "from-sky-600 to-sky-800",
  ollama: "from-slate-600 to-slate-800",
  custom: "from-rose-600 to-rose-800",
};

const PROVIDER_INITIALS: Record<string, string> = {
  openai: "OA",
  anthropic: "AN",
  gemini: "GG",
  groq: "GQ",
  mistral: "MS",
  ollama: "OL",
  custom: "CX",
};

const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq",
  mistral: "Mistral AI",
  ollama: "Ollama (Local)",
  custom: "Custom",
};

export default function Settings() {
  const [cronJobs, setCronJobs] = useState(CRON_JOBS);
  const [config, setConfig] = useState(AGENT_CONFIG);
  const { data: agents } = useListAgents();
  const [, navigate] = useLocation();

  const pluggedAgents = agents?.filter(a => a.isPluggedIn && a.provider) ?? [];

  const byProvider = pluggedAgents.reduce<Record<string, typeof pluggedAgents>>((acc, agent) => {
    const p = agent.provider!;
    if (!acc[p]) acc[p] = [];
    acc[p].push(agent);
    return acc;
  }, {});

  const toggleCron = (id: number) => {
    setCronJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: !j.enabled } : j));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-mono font-semibold uppercase tracking-tight">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-10">

        {/* AI Providers */}
        <section>
          <h2 className="font-mono text-sm uppercase text-muted-foreground mb-4 flex items-center gap-2">
            <span>AI Providers</span>
            <div className="flex-1 h-px bg-border ml-2" />
          </h2>

          {pluggedAgents.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-4 text-center">
              <Plug className="w-10 h-10 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">No AI providers connected yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Go to the AI Team page to plug in your first agent.</p>
              </div>
              <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => navigate("/team")}>
                <Plug className="w-3.5 h-3.5" />
                Go to AI Team
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(byProvider).map(([provider, providerAgents]) => (
                <div key={provider} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className={`flex items-center gap-3 p-4 bg-gradient-to-r ${PROVIDER_COLORS[provider] ?? "from-slate-600 to-slate-800"} bg-opacity-10 border-b border-border`}>
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${PROVIDER_COLORS[provider] ?? "from-slate-600 to-slate-800"} flex items-center justify-center`}>
                      <span className="font-mono text-xs font-bold text-white">{PROVIDER_INITIALS[provider] ?? "??"}</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{PROVIDER_NAMES[provider] ?? provider}</p>
                      <p className="text-xs text-muted-foreground">{providerAgents.length} agent{providerAgents.length !== 1 ? "s" : ""} connected</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-xs text-green-400 font-mono">Connected</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {providerAgents.map(agent => (
                      <div key={agent.id} className="flex items-center gap-4 p-3 hover:bg-secondary/30 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-primary/20 border border-border flex items-center justify-center flex-shrink-0">
                          <span className="font-mono text-xs text-primary">{agent.avatarInitials}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.role}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-mono text-primary">{agent.model}</p>
                          {agent.apiKeyHint && (
                            <p className="text-xs text-muted-foreground font-mono">{agent.apiKeyHint}</p>
                          )}
                        </div>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[agent.status] ?? "bg-muted-foreground"}`} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => navigate("/team")}>
                <Plug className="w-3.5 h-3.5" />
                Plug In Another Agent
              </Button>
            </div>
          )}
        </section>

        <Separator />

        {/* Cron Job Manager */}
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

        {/* Integrations */}
        <section>
          <h2 className="font-mono text-sm uppercase text-muted-foreground mb-4 flex items-center gap-2">
            <span>Integrations</span>
            <div className="flex-1 h-px bg-border ml-2" />
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {INTEGRATIONS.map(integration => (
              <div key={integration.name} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <span className="font-mono text-xs font-bold text-primary">{integration.icon}</span>
                  </div>
                  {integration.status === "connected" ? (
                    <Wifi className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                  )}
                </div>
                <p className="font-medium text-sm">{integration.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                <div className="mt-3">
                  <Badge
                    className={`text-xs px-2 py-0 ${integration.status === "connected" ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}
                  >
                    {integration.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* Agent Configuration */}
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
    </div>
  );
}
