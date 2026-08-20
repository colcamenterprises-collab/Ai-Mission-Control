import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const token = () =>
  localStorage.getItem("mission_control_admin_token") ??
  localStorage.getItem("missionControlAdminToken");
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const value = token();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(value
        ? { Authorization: `Bearer ${value}`, "x-admin-token": value }
        : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
type ApprovalRow = {
  approval: {
    id: number;
    reason: string;
    expectedEffect: string | null;
    rollbackPlan: string | null;
    proposedAction: string;
    createdAt: string;
  };
  request: {
    id: number;
    requestedAction: string;
    agentId: number | null;
    taskId: number | null;
    project: string | null;
    business: string | null;
    repository: string | null;
    environment: string | null;
    riskLevel: number;
  };
};

export default function Approvals() {
  const client = useQueryClient();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const query = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api<{ data: ApprovalRow[] }>("/approvals"),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: string }) =>
      api(`/approvals/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, note: notes[id] || null }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["approvals"] }),
  });
  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <header className="mission-page-hero workspace-panel">
          <p className="workspace-eyebrow">Control</p>
          <h1 className="mission-page-title">Needs Cameron</h1>
          <p className="mission-page-subtitle">
            One factual queue for owner decisions. Every decision is bound to
            and audited against one execution.
          </p>
        </header>
        {query.isLoading ? (
          <div className="workspace-panel p-4">Loading approvals…</div>
        ) : query.error ? (
          <div className="workspace-panel p-4 text-red-300">
            Approvals are unavailable.
          </div>
        ) : !query.data?.data.length ? (
          <div className="workspace-panel p-4">
            Nothing needs owner approval.
          </div>
        ) : (
          <div className="space-y-3">
            {query.data.data.map(({ approval, request }) => (
              <article className="workspace-panel p-4" key={approval.id}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="workspace-eyebrow">Requested action</p>
                    <h2 className="text-lg font-semibold">
                      {request.requestedAction}
                    </h2>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      <Row
                        label="Worker"
                        value={
                          request.agentId
                            ? `Agent #${request.agentId}`
                            : "UNASSIGNED"
                        }
                      />
                      <Row
                        label="Task"
                        value={
                          request.taskId ? `#${request.taskId}` : "UNKNOWN"
                        }
                      />
                      <Row
                        label="Project / Business"
                        value={`${request.project ?? "UNKNOWN"} / ${request.business ?? "UNKNOWN"}`}
                      />
                      <Row
                        label="Repository / Environment"
                        value={`${request.repository ?? "UNKNOWN"} / ${request.environment ?? "UNKNOWN"}`}
                      />
                      <Row label="Risk" value={`Level ${request.riskLevel}`} />
                      <Row label="Why required" value={approval.reason} />
                      <Row
                        label="Expected effect"
                        value={approval.expectedEffect ?? "UNKNOWN"}
                      />
                      <Row
                        label="Reversibility"
                        value={approval.rollbackPlan ?? "UNKNOWN"}
                      />
                    </tbody>
                  </table>
                </div>
                <Textarea
                  className="mt-3"
                  value={notes[approval.id] ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [approval.id]: event.target.value,
                    }))
                  }
                  placeholder="Decision note or required changes"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      decide.mutate({ id: approval.id, decision: "approve" })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      decide.mutate({ id: approval.id, decision: "reject" })
                    }
                  >
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      decide.mutate({
                        id: approval.id,
                        decision: "request_changes",
                      })
                    }
                  >
                    Request Changes
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href={`/executions/${request.id}`}>Full Context</Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-border/40">
      <th className="py-1 pr-3 text-left text-muted-foreground">{label}</th>
      <td className="py-1">{value}</td>
    </tr>
  );
}
