import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, Loader2, Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type IntakeResponse = {
  accepted: boolean;
  task?: {
    id: number;
    title: string;
    assignee: string;
    status: string;
    priority: string;
    project: string;
  };
  orchestratorReview?: {
    recommendedAgent: string;
    role: string;
    department: string;
    reason: string;
    confidence: number;
  };
  allocation?: {
    agentId: number;
    agentName: string;
    commandId: number;
    delivery: string;
    nextStep: string;
  };
};

const PROJECTS = [
  "Mission Control",
  "HHA",
  "SBB App Staging",
  "SBB App Production",
  "Customli Website",
  "SBB Website",
];

const PRIORITIES = ["low", "medium", "high", "critical"];
const REQUESTED_AGENTS = ["auto", "James", "Dev/Codex", "Scout", "Scribe", "Reach"];
const TOKEN_STORAGE_KEY = "missionControlAdminToken";

function getSavedToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unable to submit orchestrator task.";
}

async function readError(response: Response) {
  const text = await response.text();
  if (!text.trim()) return `${response.status} ${response.statusText}`;
  try {
    const json = JSON.parse(text) as { error?: string; message?: string };
    return json.error ?? json.message ?? text;
  } catch {
    return text.length > 240 ? `${text.slice(0, 237)}...` : text;
  }
}

export function OrchestratorIntakePanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    description: "",
    project: "Mission Control",
    priority: "high",
    requestedAgent: "auto",
    adminToken: getSavedToken(),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const adminToken = form.adminToken.trim();
      if (typeof window !== "undefined") {
        if (adminToken) window.localStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
        else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }

      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

      const response = await fetch("/api/orchestrator/intake", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          project: form.project,
          priority: form.priority,
          requestedAgent: form.requestedAgent === "auto" ? undefined : form.requestedAgent,
        }),
      });

      if (!response.ok) throw new Error(await readError(response));

      const payload = (await response.json()) as IntakeResponse;
      setResult(payload);
      setForm((current) => ({ ...current, title: "", description: "", requestedAgent: "auto" }));
      queryClient.invalidateQueries();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const disabled = isSubmitting || !form.title.trim() || !form.description.trim();

  return (
    <section className="workspace-panel overflow-hidden p-4 md:p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Orchestrator MVP</Badge>
            <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Task intake</span>
          </div>
          <h2 className="dashboard-section-title flex items-center gap-2 text-lg md:text-xl">
            <Bot className="h-4 w-4" /> Add Orchestrator Task
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Submit a task once. Mission Control reviews it, recommends the right agent, creates the task, and queues the agent command.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-mono uppercase tracking-wider text-foreground"><Sparkles className="h-3.5 w-3.5" /> Flow</div>
          <div className="mt-1">Receive → Review → Recommend → Allocate</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Title</Label>
            <Input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Example: Review HHA mobile layout"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Task brief</Label>
            <Textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Explain the outcome, constraints, access limits, safety rules, and what the agent should report back."
              rows={5}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-background/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Project</Label>
              <Select value={form.project} onValueChange={(value) => setForm((current) => ({ ...current, project: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECTS.map((project) => <SelectItem key={project} value={project}>{project}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Priority</Label>
              <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Requested agent</Label>
            <Select value={form.requestedAgent} onValueChange={(value) => setForm((current) => ({ ...current, requestedAgent: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REQUESTED_AGENTS.map((agent) => (
                  <SelectItem key={agent} value={agent}>{agent === "auto" ? "Auto — Orchestrator decides" : agent}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Admin token</Label>
            <Input
              type="password"
              value={form.adminToken}
              onChange={(event) => setForm((current) => ({ ...current, adminToken: event.target.value }))}
              placeholder="Only needed if browser API calls are not already authenticated"
            />
            <p className="text-[11px] text-muted-foreground">Saved locally in this browser only. Leave as-is once set.</p>
          </div>

          <Button className="w-full gap-2" disabled={disabled} onClick={submit}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isSubmitting ? "Submitting" : "Submit to Orchestrator"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {result?.accepted && result.task && result.orchestratorReview && result.allocation && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm md:grid-cols-3">
          <div>
            <div className="mb-1 flex items-center gap-2 font-mono text-xs uppercase text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Accepted</div>
            <p className="font-medium">Task #{result.task.id}</p>
            <p className="text-muted-foreground">{result.task.title}</p>
          </div>
          <div>
            <div className="mb-1 font-mono text-xs uppercase text-muted-foreground">Recommended agent</div>
            <p className="font-medium">{result.orchestratorReview.recommendedAgent}</p>
            <p className="text-muted-foreground">{result.orchestratorReview.reason}</p>
          </div>
          <div>
            <div className="mb-1 font-mono text-xs uppercase text-muted-foreground">Queued command</div>
            <p className="font-medium">Command #{result.allocation.commandId}</p>
            <p className="text-muted-foreground">{result.allocation.delivery.replaceAll("_", " ")}</p>
          </div>
        </div>
      )}
    </section>
  );
}
