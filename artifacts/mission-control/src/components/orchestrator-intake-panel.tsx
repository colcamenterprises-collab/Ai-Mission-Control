import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListTasksQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
  const [request, setRequest] = useState("");
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
          title: request.trim().split(/\n/)[0].slice(0, 120),
          description: request.trim(),
          project: DEFAULT_PROJECT,
          priority: DEFAULT_PRIORITY,
        }),
      });
      const body = await response.json() as IntakeResult | { error?: string };
      if (!response.ok) throw new Error("error" in body ? body.error : `Unable to add work (HTTP ${response.status}).`);
      setCreated(body as IntakeResult);
      setRequest("");
      await queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally { setIsSubmitting(false); }
  };

  const disabled = isSubmitting || !request.trim();

  return (
    <section className="workspace-panel orchestrator-intake task-intake-simple p-4 md:p-5">
      <div className="task-intake-grid">
        <Textarea aria-label="Task request" placeholder="Enter a task" value={request} onChange={(event) => setRequest(event.target.value)} rows={2} />
        <Button className="task-intake-button" disabled={disabled} onClick={submit}>
          {isSubmitting ? "Creating" : "Create task"}
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
