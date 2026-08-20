import { useQuery } from "@tanstack/react-query";
const auth = (): Record<string, string> => {
  const token =
    localStorage.getItem("mission_control_admin_token") ??
    localStorage.getItem("missionControlAdminToken");
  return token
    ? { Authorization: `Bearer ${token}`, "x-admin-token": token }
    : {};
};
type Pulse = {
  status: string;
  sources: Array<{
    id: number;
    provider: string;
    status: string;
    lastSyncAt: string | null;
    lastError: string | null;
  }>;
  accounts: Array<Record<string, unknown>>;
};
export default function ClientPulse() {
  const query = useQuery({
    queryKey: ["client-pulse"],
    queryFn: async () => {
      const response = await fetch("/api/client-pulse", { headers: auth() });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<Pulse>;
    },
  });
  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <header className="mission-page-hero workspace-panel">
          <p className="workspace-eyebrow">Business</p>
          <h1 className="mission-page-title">Client Pulse</h1>
          <p className="mission-page-subtitle">
            Evidence-backed account health. Unconnected sources and missing
            facts remain explicit.
          </p>
        </header>
        <section className="workspace-panel p-4">
          <h2 className="font-semibold">
            Source status: {query.data?.status ?? "UNKNOWN"}
          </h2>
          {query.error ? (
            <p>Account sources are unavailable.</p>
          ) : !query.data?.sources.length ? (
            <p>NOT CONNECTED — no account source adapter is configured.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Last sync</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {query.data.sources.map((source) => (
                  <tr key={source.id}>
                    <td>{source.provider}</td>
                    <td>{source.status}</td>
                    <td>{source.lastSyncAt ?? "NEVER"}</td>
                    <td>{source.lastError ?? "NONE"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="workspace-panel overflow-auto p-4">
          <h2 className="font-semibold">Accounts</h2>
          {!query.data?.accounts.length ? (
            <p>NO DATA</p>
          ) : (
            <pre className="text-xs">
              {JSON.stringify(query.data.accounts, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
