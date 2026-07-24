import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle, Bot, CheckCircle2, ClipboardCheck, FileText, ListTodo, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import "./workspaces.css";

type ActivityEntry = {
  id: number;
  agentName: string;
  action: string;
  detail: string | null;
  status: string;
  createdAt: string;
};

type TaskEntry = {
  id: number;
  title: string;
  description: string | null;
  assignee: string;
  priority: string;
  status: string;
  project: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

const PRIMARY_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_STORAGE_KEY = "missionControlAdminToken";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(PRIMARY_TOKEN_STORAGE_KEY) ?? localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY);
  return token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {};
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: { Accept: "application/json", ...authHeaders() } });
  if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusTone(status: string) {
  if (["active", "done"].includes(status)) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (["error", "blocked"].includes(status)) return "border-red-400/20 bg-red-400/10 text-red-100";
  if (["pending", "review", "running"].includes(status)) return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
  return "border-slate-400/20 bg-slate-400/10 text-slate-200";
}

function needsOwnerReview(entry: ActivityEntry) {
  const text = `${entry.action} ${entry.detail ?? ""}`.toLowerCase();
  return text.includes("approval") || text.includes("owner") || text.includes("blocked") || text.includes("permission") || text.includes("access required");
}

function hasPlaybookSignal(entry: ActivityEntry) {
  const text = `${entry.action} ${entry.detail ?? ""}`.toLowerCase();
  return text.includes("playbook") || text.includes("agent os") || text.includes("standard") || text.includes("spec");
}

function matchTaskForActivity(entry: ActivityEntry, tasks: TaskEntry[]) {
  const taskMatch = `${entry.action} ${entry.detail ?? ""}`.match(/Task #(\d+)/i);
  if (taskMatch?.[1]) return tasks.find((task) => task.id === Number(taskMatch[1])) ?? null;
  return tasks.find((task) => task.assignee === entry.agentName && Math.abs(new Date(task.updatedAt).getTime() - new Date(entry.createdAt).getTime()) < 120_000) ?? null;
}

export default function Reports() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const activityQuery = useQuery({ queryKey: ["work-reports", "activity"], queryFn: () => apiFetch<ActivityEntry[]>("/activity?limit=80") });
  const tasksQuery = useQuery({ queryKey: ["work-reports", "tasks"], queryFn: () => apiFetch<TaskEntry[]>("/tasks") });

  const activities = activityQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const reports = useMemo(() => activities.filter((entry) => /work|task|dispatch|connection|routed|completed|failed/i.test(entry.action)), [activities]);
  const selected = reports.find((entry) => entry.id === selectedId) ?? reports[0] ?? null;
  const selectedTask = selected ? matchTaskForActivity(selected, tasks) : null;
  const completedCount = tasks.filter((task) => task.status === "done").length;
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const reviewCount = reports.filter(needsOwnerReview).length;

  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <header className="mission-page-hero workspace-panel">
          <p className="workspace-eyebrow">Reports</p>
          <h1 className="mission-page-title">Work reports and activity.</h1>
          <p className="mission-page-subtitle">Review what your AI workers were asked, what they returned, what was saved, and what needs owner attention.</p>
        </header>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Metric label="Reports" value={reports.length} icon={<FileText className="h-4 w-4" />} />
          <Metric label="Tasks done" value={completedCount} icon={<CheckCircle2 className="h-4 w-4" />} />
          <Metric label="Owner review" value={reviewCount} icon={<ShieldCheck className="h-4 w-4" />} />
          <Metric label="Blocked" value={blockedCount} icon={<AlertCircle className="h-4 w-4" />} />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(18rem,25rem)_1fr]">
          <div className="workspace-panel p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="dashboard-section-title flex items-center gap-2"><Activity className="h-4 w-4" /> Timeline</h2>
              <Button size="sm" variant="outline" onClick={() => { void activityQuery.refetch(); void tasksQuery.refetch(); }}>Refresh</Button>
            </div>
            {activityQuery.isLoading ? (
              <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
            ) : activityQuery.error ? (
              <p className="text-sm text-red-300">Could not load reports.</p>
            ) : reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">No worker reports have been saved yet.</p>
            ) : (
              <div className="space-y-2">
                {reports.map((entry) => (
                  <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} className={`w-full rounded-2xl border p-3 text-left transition-colors ${selected?.id === entry.id ? "border-primary/60 bg-primary/10" : "border-border bg-card/60 hover:border-primary/40"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><strong className="block truncate text-sm text-foreground">{entry.action}</strong><span className="mt-1 block text-xs text-muted-foreground">{entry.agentName} · {formatDate(entry.createdAt)}</span></div>
                      <Badge variant="outline" className={`text-[10px] ${statusTone(entry.status)}`}>{entry.status}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{entry.detail || "No detail saved."}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="workspace-panel p-4">
            {selected ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="workspace-eyebrow">Selected report</p>
                    <h2 className="mission-page-title text-2xl">{selected.action}</h2>
                    <p className="text-sm text-muted-foreground">{selected.agentName} · {formatDate(selected.createdAt)}</p>
                  </div>
                  <Badge variant="outline" className={statusTone(selected.status)}>{selected.status}</Badge>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <DetailCard title="Worker" value={selected.agentName} icon={<Bot className="h-4 w-4" />} />
                  <DetailCard title="Task" value={selectedTask ? `#${selectedTask.id} · ${selectedTask.status}` : "No task link found"} icon={<ListTodo className="h-4 w-4" />} />
                  <DetailCard title="Review" value={needsOwnerReview(selected) ? "Owner attention" : "No blocker detected"} icon={<ClipboardCheck className="h-4 w-4" />} />
                </div>

                {selectedTask && (
                  <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                    <p className="workspace-eyebrow">Task brief</p>
                    <h3 className="mt-1 text-base font-semibold text-foreground">{selectedTask.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{selectedTask.description || "No task description saved."}</p>
                  </div>
                )}

                <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {hasPlaybookSignal(selected) && <Badge variant="outline" className="border-cyan-400/20 bg-cyan-400/10 text-cyan-100">Playbooks referenced</Badge>}
                    {needsOwnerReview(selected) && <Badge variant="outline" className="border-yellow-400/20 bg-yellow-400/10 text-yellow-100">Owner review</Badge>}
                  </div>
                  <p className="workspace-eyebrow">Worker response</p>
                  <pre className="mt-3 max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background/50 p-4 text-sm leading-relaxed text-foreground">{selected.detail || "No response detail saved."}</pre>
                </div>
              </div>
            ) : (
              <div className="grid min-h-[24rem] place-items-center text-center text-sm text-muted-foreground">Choose a report to review.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <article className="workspace-panel p-4">
      <div className="flex items-center justify-between text-muted-foreground"><span className="text-xs uppercase tracking-[0.18em]">{label}</span>{icon}</div>
      <strong className="mt-3 block text-3xl tracking-tight text-foreground">{value}</strong>
    </article>
  );
}

function DetailCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-secondary/20 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">{icon}{title}</div>
      <strong className="mt-2 block text-sm text-foreground">{value}</strong>
    </div>
  );
}
