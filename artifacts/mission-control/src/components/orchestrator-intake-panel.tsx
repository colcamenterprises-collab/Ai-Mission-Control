import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListTasksQueryKey, useCreateTask } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUpRight, Sparkles } from "lucide-react";

const DEFAULT_PROJECT = "Mission Control";
const DEFAULT_PRIORITY = "medium";
const DEFAULT_STATUS = "backlog";
const DEFAULT_ASSIGNEE = "Unassigned";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unable to add task.";
}

export function OrchestratorIntakePanel() {
  const queryClient = useQueryClient();
  const createTask = useCreateTask();
  const [form, setForm] = useState({ title: "", description: "" });
  const [createdTaskId, setCreatedTaskId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setCreatedTaskId(null);

    try {
      const task = await createTask.mutateAsync({
        data: {
          title: form.title.trim(),
          description: form.description.trim(),
          assignee: DEFAULT_ASSIGNEE,
          priority: DEFAULT_PRIORITY,
          status: DEFAULT_STATUS,
          project: DEFAULT_PROJECT,
          dueDate: null,
        },
      });
      setCreatedTaskId(task.id);
      setForm({ title: "", description: "" });
      await queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  const isSubmitting = createTask.isPending;
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

      {createdTaskId && (
        <div className="accepted-card task-accepted-simple">
          <span>Work added</span>
          <strong>Reference #{createdTaskId}</strong>
        </div>
      )}
    </section>
  );
}
