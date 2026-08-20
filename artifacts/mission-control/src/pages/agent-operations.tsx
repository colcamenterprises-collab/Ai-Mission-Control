import { useQuery } from "@tanstack/react-query";
type AgentOps = {
  id: number;
  name: string;
  health: string;
  lastHeartbeat: string | null;
  runtime: string;
  provider: string | null;
  model: string | null;
  current: {
    requestedAction: string;
    project: string | null;
    repository: string | null;
  } | null;
  queueDepth: number;
  running: number;
  awaitingApprovals: number;
  recentCompleted: unknown[];
  recentFailed: unknown[];
  lastError: string | null;
  scopes: Array<{ scopeType: string; scopeValue: string; operation: string }>;
  usage: { inputTokens: number; outputTokens: number; cost: number | null };
};
function headers(): Record<string, string> {
  const token =
    localStorage.getItem("mission_control_admin_token") ??
    localStorage.getItem("missionControlAdminToken");
  return token
    ? { Authorization: `Bearer ${token}`, "x-admin-token": token }
    : {};
}
export default function AgentOperations() {
  const query = useQuery({
    queryKey: ["agent-operations"],
    queryFn: async () => {
      const response = await fetch("/api/operations/agents", {
        headers: headers(),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<{ data: AgentOps[] }>;
    },
    refetchInterval: 30_000,
  });
  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <header className="mission-page-hero workspace-panel">
          <p className="workspace-eyebrow">Agents</p>
          <h1 className="mission-page-title">Agent operations</h1>
          <p className="mission-page-subtitle">
            Runtime health is derived from real heartbeat and execution records.
          </p>
        </header>
        <div className="workspace-panel overflow-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Health / Heartbeat</th>
                <th>Runtime</th>
                <th>Current work</th>
                <th>Queue / Running / Approval</th>
                <th>Access scopes</th>
                <th>Usage / Cost</th>
                <th>Last error</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.data.map((agent) => (
                <tr className="border-t border-border align-top" key={agent.id}>
                  <td className="py-2 font-semibold">{agent.name}</td>
                  <td>
                    {agent.health}
                    <br />
                    <small>
                      {agent.lastHeartbeat
                        ? new Date(agent.lastHeartbeat).toLocaleString()
                        : "NEVER"}
                    </small>
                  </td>
                  <td>
                    {agent.runtime}
                    <br />
                    <small>
                      {agent.provider ?? "UNKNOWN"} / {agent.model ?? "UNKNOWN"}
                    </small>
                  </td>
                  <td>
                    {agent.current?.requestedAction ?? "IDLE"}
                    <br />
                    <small>
                      {agent.current?.project ?? "UNKNOWN"} /{" "}
                      {agent.current?.repository ?? "UNKNOWN"}
                    </small>
                  </td>
                  <td>
                    {agent.queueDepth} / {agent.running} /{" "}
                    {agent.awaitingApprovals}
                  </td>
                  <td>
                    {agent.scopes.length
                      ? agent.scopes
                          .map(
                            (scope) =>
                              `${scope.scopeType}:${scope.scopeValue} (${scope.operation})`,
                          )
                          .join(", ")
                      : "NONE"}
                  </td>
                  <td>
                    {agent.usage.inputTokens + agent.usage.outputTokens} tokens
                    <br />
                    {agent.usage.cost ?? "UNKNOWN"}
                  </td>
                  <td>{agent.lastError ?? "NONE"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.error && <p>Agent operations are unavailable.</p>}
        </div>
      </div>
    </div>
  );
}
