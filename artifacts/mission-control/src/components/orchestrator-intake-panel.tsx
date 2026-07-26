import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListTasksQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUpRight, Sparkles } from "lucide-react";

const DEFAULT_PROJECT = "Mission Control";
const DEFAULT_PRIORITY = "medium";
const PRIMARY_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_STORAGE_KEY = "missionControlAdminToken";

type IntakeResult = {
  task: { id: number; status: string };
  orchestratorReview: { recommendedAgent: string; confidence: number };
  allocation: { delivery: string; nextStep: string } | null;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unable to add task.";
}

export function OrchestratorIntakePanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: "", description: "" });
  const [created, setCreated] = useState<IntakeResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setCreated(null);
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem(PRIMARY_TOKEN_STORAGE_KEY) ?? localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY);
      const response = await fetch("/api/orchestrator/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          project: DEFAULT_PROJECT,
          priority: DEFAULT_PRIORITY,
        }),
      });
      const body = await response.json() as IntakeResult | { error?: string };
      if (!response.ok) throw new Error("error" in body ? body.error : `Unable to add work (HTTP ${response.status}).`);
      setCreated(body as IntakeResult);
      setForm({ title: "", description: "" });
      await queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally { setIsSubmitting(false); }
  };

  const disabled = isSubmitting || !form.title.trim() || !form.description.trim();

  return (
    <section className="workspace-panel orchestrator-intake task-intake-simple p-4 md:p-5">
      <div className="task-intake-heading">
        <div className="task-intake-icon"><Sparkles /></div>
        <div><p>New work</p><span>Tell us what needs doing. The right worker will be selected for it.</span></div>
      </div>
      <div className="task-intake-grid">
        <div className="space-y-1.5">
          <Label>What needs doing?</Label>
          <Input placeholder="Short title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Give it context</Label>
          <Textarea placeholder="What does good look like? Add any useful detail." value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
        </div>
        <Button className="task-intake-button" disabled={disabled} onClick={submit}>
          {isSubmitting ? "Sending" : <>Send work <ArrowUpRight /></>}
        </Button>
      </div>

      {error && <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {created && (
        <div className="accepted-card task-accepted-simple">
          <span>{created.orchestratorReview.recommendedAgent === "Unassigned" ? "Work added for triage" : `Routed to ${created.orchestratorReview.recommendedAgent}`}</span>
          <strong>Reference #{created.task.id} · {created.allocation?.delivery === "runtime_completed" ? "Ready for review" : "Queued"}</strong>
        </div>
      )}
    </section>
  );
}
