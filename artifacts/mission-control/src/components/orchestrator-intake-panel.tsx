import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Send, Sparkles } from "lucide-react";
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
const PRIMARY_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_STORAGE_KEY = "missionControlAdminToken";

function getSavedToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PRIMARY_TOKEN_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) ?? "";
}

function saveToken(token: string) {
  if (typeof window === "undefined") return;
  const cleaned = token.trim();
  if (!cleaned) {
    window.localStorage.removeItem(PRIMARY_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(PRIMARY_TOKEN_STORAGE_KEY, cleaned);
  window.localStorage.setItem(LEGACY_TOKEN_STORAGE_KEY, cleaned);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unable to submit task.";
}

async function readError(response: Response) {
  const text = await response.text();
  if (!text.trim()) return `${response.status} ${response.statusText}`;
  try {
    const json = JSON.parse(text) as { error?: string; message?: string };
    return json.error ?? json.message ?? text;
  } catch {
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }
}

export function OrchestratorIntakePanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    description: "",
    project: "Mission Control",
    priority: "high",
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
      saveToken(adminToken);

      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (adminToken) {
        headers.Authorization = `Bearer ${adminToken}`;
        headers["x-admin-token"] = adminToken;
      }

      const response = await fetch("/api/orchestrator/intake", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          project: form.project,
          priority: form.priority,
        }),
      });

      if (!response.ok) throw new Error(await readError(response));

      const payload = (await response.json()) as IntakeResponse;
      setResult(payload);
      setForm((current) => ({ ...current, title: "", description: "", adminToken }));
      queryClient.invalidateQueries();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const disabled = isSubmitting || !form.title.trim() || !form.description.trim();

  return (
    <section className="workspace-panel orchestrator-intake p-4 md:p-5">
      <div className="intake-head">
        <div>
          <span className="dashboard-topline"><Sparkles className="h-3.5 w-3.5" /> Orchestrator</span>
          <h2>New task</h2>
        </div>
        <div className="intake-flow"><span /> receive <span /> route <span /> queue</div>
      </div>

      <div className="intake-grid">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="What needs to happen?"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Brief</Label>
            <Textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Outcome, constraints, access limits, deliverable."
              rows={4}
            />
          </div>
        </div>

        <div className="intake-side">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={form.project} onValueChange={(value) => setForm((current) => ({ ...current, project: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECTS.map((project) => <SelectItem key={project} value={project}>{project}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <details className="advanced-token">
            <summary>Access token</summary>
            <Input
              type="password"
              value={form.adminToken}
              onChange={(event) => setForm((current) => ({ ...current, adminToken: event.target.value }))}
              placeholder="Saved in Settings"
            />
          </details>

          <Button className="w-full gap-2" disabled={disabled} onClick={submit}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isSubmitting ? "Sending" : "Send to Orchestrator"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {result?.accepted && result.task && result.orchestratorReview && result.allocation && (
        <div className="accepted-card">
          <div><CheckCircle2 className="h-4 w-4" /><span>Accepted</span><strong>Task #{result.task.id}</strong></div>
          <div><span>Agent</span><strong>{result.orchestratorReview.recommendedAgent}</strong></div>
          <div><span>Command</span><strong>#{result.allocation.commandId}</strong></div>
        </div>
      )}
    </section>
  );
}
