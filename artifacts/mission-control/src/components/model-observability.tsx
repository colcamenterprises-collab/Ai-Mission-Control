import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./model-observability.css";

type UsageRow = {
  agent_id: number | null;
  agent_name: string | null;
  provider: string;
  model: string;
  requests: number | string;
  total_tokens: number | string;
  cost_usd: number | string;
  failed_requests: number | string;
};
type PolicyRow = {
  agentId: number;
  name: string;
  role: string;
  runtimeProvider: string | null;
  runtimeModel: string | null;
  policy: {
    primaryModel: string;
    fallbackModel?: string | null;
    policyClass: string;
    maxCostClass: string;
  };
  runtimeAligned: boolean;
};

async function json<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
const n = (value: number | string | null | undefined) =>
  Number(value ?? 0) || 0;

export function ModelObservability() {
  const usage = useQuery({
    queryKey: ["model-usage", 30],
    queryFn: () =>
      json<{ days: number; usage: UsageRow[] }>("/api/model-usage?days=30"),
  });
  const policy = useQuery({
    queryKey: ["model-policy"],
    queryFn: () => json<{ agents: PolicyRow[] }>("/api/model-policy"),
  });
  if (usage.isLoading || policy.isLoading)
    return (
      <section className="model-observability model-observability-loading">
        Loading model economics…
      </section>
    );
  if (usage.isError || policy.isError)
    return (
      <section className="model-observability model-observability-error">
        <strong>Model economics unavailable</strong>
        <span>
          Mission Control could not retrieve model usage or policy data.
        </span>
      </section>
    );

  const rows = usage.data?.usage ?? [];
  const totalSpend = rows.reduce((sum, row) => sum + n(row.cost_usd), 0);
  const totalRequests = rows.reduce((sum, row) => sum + n(row.requests), 0);
  const totalTokens = rows.reduce((sum, row) => sum + n(row.total_tokens), 0);
  const failed = rows.reduce((sum, row) => sum + n(row.failed_requests), 0);
  const byAgent = new Map<
    string,
    { agent: string; spend: number; requests: number; tokens: number }
  >();
  for (const row of rows) {
    const agent = row.agent_name || "Unattributed";
    const current = byAgent.get(agent) || {
      agent,
      spend: 0,
      requests: 0,
      tokens: 0,
    };
    current.spend += n(row.cost_usd);
    current.requests += n(row.requests);
    current.tokens += n(row.total_tokens);
    byAgent.set(agent, current);
  }
  const chart = [...byAgent.values()]
    .sort((a, b) => b.spend - a.spend || b.requests - a.requests)
    .slice(0, 8);
  const top = [...rows].sort(
    (a, b) => n(b.cost_usd) - n(a.cost_usd) || n(b.requests) - n(a.requests),
  )[0];

  return (
    <section className="model-observability">
      <header>
        <div>
          <span>AI economics · 30 days</span>
          <h2>Model spend & routing</h2>
          <p>
            Actual recorded provider usage. Missing provider cost remains
            unpriced rather than estimated.
          </p>
        </div>
        <div className="model-observability-top">
          <small>Highest spend model</small>
          <strong>{top?.model || "No priced usage"}</strong>
        </div>
      </header>
      <div className="model-observability-metrics">
        <Metric label="Recorded spend" value={`$${totalSpend.toFixed(4)}`} />
        <Metric label="Requests" value={totalRequests.toLocaleString()} />
        <Metric label="Tokens" value={totalTokens.toLocaleString()} />
        <Metric label="Failed" value={failed.toLocaleString()} />
      </div>
      <div className="model-observability-grid">
        <article>
          <h3>Spend by agent</h3>
          {chart.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={chart}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  opacity={0.16}
                />
                <XAxis dataKey="agent" tick={{ fontSize: 10 }} interval={0} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                />
                <Tooltip
                  formatter={(value) => [
                    `$${Number(value).toFixed(5)}`,
                    "Spend",
                  ]}
                />
                <Bar
                  dataKey="spend"
                  radius={[7, 7, 0, 0]}
                  fill="currentColor"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="model-observability-empty">
              No priced model usage recorded yet.
            </p>
          )}
        </article>
        <article>
          <h3>Agent model policy</h3>
          <div className="model-policy-list">
            {(policy.data?.agents ?? []).map((agent) => (
              <div key={agent.agentId}>
                <div>
                  <strong>{agent.name}</strong>
                  <span>{agent.role}</span>
                </div>
                <div>
                  <strong>{agent.policy.primaryModel}</strong>
                  <span>
                    {agent.policy.policyClass} · {agent.policy.maxCostClass}
                    {agent.runtimeAligned
                      ? " · aligned"
                      : " · runtime mismatch"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
