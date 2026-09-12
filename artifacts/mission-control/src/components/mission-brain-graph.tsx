import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import "./mission-brain-graph.css";

type GraphNode = {
  id: string;
  type: "project" | "agent" | "task" | "memory";
  label: string;
  meta?: Record<string, unknown>;
};
type GraphEdge = { id: string; source: string; target: string; type: string };
type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: Record<string, number>;
};
type Positioned = GraphNode & { x: number; y: number };

async function loadGraph(): Promise<GraphData> {
  const response = await fetch("/api/brain/graph", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<GraphData>;
}

export function MissionBrainGraph() {
  const graph = useQuery({
    queryKey: ["mission-brain-graph"],
    queryFn: loadGraph,
  });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const layout = useMemo(
    () => positionNodes(graph.data?.nodes ?? []),
    [graph.data?.nodes],
  );
  const positions = useMemo(
    () => new Map(layout.map((node) => [node.id, node])),
    [layout],
  );
  if (graph.isLoading)
    return (
      <section className="brain-graph-shell brain-graph-state">
        Building organisational graph…
      </section>
    );
  if (graph.isError)
    return (
      <section className="brain-graph-shell brain-graph-state brain-graph-error">
        Mission Brain graph unavailable.
      </section>
    );
  const data = graph.data!;
  return (
    <section className="brain-graph-shell">
      <header>
        <div>
          <span>Organisational graph</span>
          <h2>Mission Brain network</h2>
          <p>
            Live relationships between projects, agents, work and durable
            knowledge.
          </p>
        </div>
        <div className="brain-graph-counts">
          {Object.entries(data.counts).map(([key, value]) => (
            <div key={key}>
              <strong>{value}</strong>
              <span>{key}</span>
            </div>
          ))}
        </div>
      </header>
      <div className="brain-graph-stage">
        <svg
          viewBox="0 0 1200 620"
          role="img"
          aria-label="Mission Brain relationship graph"
        >
          <g className="brain-graph-edges">
            {data.edges.map((edge) => {
              const a = positions.get(edge.source);
              const b = positions.get(edge.target);
              return a && b ? (
                <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                  <title>{edge.type}</title>
                </line>
              ) : null;
            })}
          </g>
          <g>
            {layout.map((node) => (
              <g
                key={node.id}
                className={`brain-node brain-node-${node.type}`}
                transform={`translate(${node.x} ${node.y})`}
                onClick={() => setSelected(node)}
                role="button"
                tabIndex={0}
              >
                <circle
                  r={
                    node.type === "project"
                      ? 19
                      : node.type === "agent"
                        ? 15
                        : 10
                  }
                />
                <text y={node.type === "project" ? 33 : 26}>
                  {trim(node.label, node.type === "project" ? 22 : 16)}
                </text>
                <title>{node.label}</title>
              </g>
            ))}
          </g>
        </svg>
        {selected && (
          <aside className="brain-node-inspector">
            <span>{selected.type}</span>
            <strong>{selected.label}</strong>
            {selected.meta &&
              Object.entries(selected.meta)
                .filter(
                  ([, value]) =>
                    value !== null &&
                    value !== undefined &&
                    String(value).trim(),
                )
                .slice(0, 5)
                .map(([key, value]) => (
                  <div key={key}>
                    <small>{key}</small>
                    <p>{String(value)}</p>
                  </div>
                ))}
            <button onClick={() => setSelected(null)}>Close</button>
          </aside>
        )}
      </div>
      <footer>
        <Legend type="project" label="Projects" />
        <Legend type="agent" label="Agents" />
        <Legend type="task" label="Tasks" />
        <Legend type="memory" label="Knowledge" />
      </footer>
    </section>
  );
}

function positionNodes(nodes: GraphNode[]): Positioned[] {
  const groups: GraphNode["type"][] = ["project", "agent", "task", "memory"];
  const centers = {
    project: [220, 180],
    agent: [850, 170],
    task: [610, 400],
    memory: [260, 470],
  } as const;
  const radii = { project: 105, agent: 140, task: 225, memory: 130 };
  const positioned: Positioned[] = [];
  for (const type of groups) {
    const bucket = nodes.filter((node) => node.type === type);
    bucket.forEach((node, index) => {
      const angle =
        (Math.PI * 2 * index) / Math.max(bucket.length, 1) - Math.PI / 2;
      const radius = bucket.length <= 1 ? 0 : radii[type] + (index % 3) * 18;
      positioned.push({
        ...node,
        x: centers[type][0] + Math.cos(angle) * radius,
        y: centers[type][1] + Math.sin(angle) * radius,
      });
    });
  }
  return positioned;
}
function trim(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
function Legend({ type, label }: { type: GraphNode["type"]; label: string }) {
  return (
    <span className={`brain-legend brain-legend-${type}`}>
      <i />
      {label}
    </span>
  );
}
