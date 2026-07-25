import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type IntakeResponse = {
  accepted: boolean;
  task?: { id: number; title: string; assignee: string; status: string; priority: string; project: string };
};

const DEFAULT_PROJECT = "Mission Control";
const DEFAULT_PRIORITY = "high";
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
  return "Unable to add task.";
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
  const [form, setForm] = useState({ title: "", description: "", adminToken: getSavedToken() });
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
      const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
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
          project: DEFAULT_PROJECT,
          priority: DEFAULT_PRIORITY,
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
    <section className="workspace-panel orchestrator-intake task-intake-simple p-4 md:p-5">
      <div className="task-intake-grid">
        <div className="space-y-1.5">
          <Label>Task Title</Label>
          <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
        </div>
        <Button className="task-intake-button" disabled={disabled} onClick={submit}>
          {isSubmitting ? "Adding" : "Add Task"}
        </Button>
      </div>

      <input
        type="password"
        value={form.adminToken}
        onChange={(event) => setForm((current) => ({ ...current, adminToken: event.target.value }))}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      {error && <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {result?.accepted && result.task && (
        <div className="accepted-card task-accepted-simple">
          <span>Added</span>
          <strong>Task #{result.task.id}</strong>
        </div>
      )}
    </section>
  );
}
