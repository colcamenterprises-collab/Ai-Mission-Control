import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
const auth = (): Record<string, string> => {
  const token =
    localStorage.getItem("mission_control_admin_token") ??
    localStorage.getItem("missionControlAdminToken");
  return token
    ? { Authorization: `Bearer ${token}`, "x-admin-token": token }
    : {};
};
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  Object.entries(auth()).forEach(([key, value]) => headers.set(key, value));
  const response = await fetch(`/api${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
type Signal = {
  id: number;
  title: string;
  source: string;
  business: string | null;
  project: string | null;
  category: string;
  evidence: unknown;
  confidence: string | null;
  severity: string | null;
  urgency: string | null;
  actionability: string | null;
  owner: string | null;
  linkedTaskId: number | null;
  status: string;
  detectedAt: string;
};
export default function Signals() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["signals"],
    queryFn: () => api<{ data: Signal[] }>("/signals"),
  });
  const convert = useMutation({
    mutationFn: (id: number) =>
      api(`/signals/${id}/convert-to-task`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["signals"] }),
  });
  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <header className="mission-page-hero workspace-panel">
          <p className="workspace-eyebrow">Intelligence</p>
          <h1 className="mission-page-title">Signals</h1>
          <p className="mission-page-subtitle">
            Evidence-backed observations from configured sources. No source data
            is invented.
          </p>
        </header>
        <div className="workspace-panel overflow-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Source</th>
                <th>Scope</th>
                <th>Category</th>
                <th>Confidence</th>
                <th>Severity / Urgency</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.data.map((signal) => (
                <tr className="border-t border-border" key={signal.id}>
                  <td className="py-2">
                    <strong>{signal.title}</strong>
                    <details>
                      <summary>Evidence</summary>
                      <pre className="max-w-lg whitespace-pre-wrap text-xs">
                        {JSON.stringify(signal.evidence, null, 2)}
                      </pre>
                    </details>
                  </td>
                  <td>{signal.source}</td>
                  <td>
                    {signal.business ?? "UNKNOWN"} /{" "}
                    {signal.project ?? "UNKNOWN"}
                  </td>
                  <td>{signal.category}</td>
                  <td>{signal.confidence ?? "UNKNOWN"}</td>
                  <td>
                    {signal.severity ?? "UNKNOWN"} /{" "}
                    {signal.urgency ?? "UNKNOWN"}
                  </td>
                  <td>{signal.status}</td>
                  <td>
                    {signal.linkedTaskId ? (
                      `Task #${signal.linkedTaskId}`
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => convert.mutate(signal.id)}
                      >
                        Convert to Task
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.error && <p>Signals are unavailable.</p>}
          {!query.isLoading && !query.data?.data.length && (
            <p>
              No signals have been recorded. Configure a source adapter to begin
              ingestion.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
