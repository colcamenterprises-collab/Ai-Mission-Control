import { count, eq, sql } from "drizzle-orm";
import {
  db,
  agentsTable,
  tasksTable,
  workRequestsTable,
  approvalsTable,
  agentRuntimeInstancesTable,
} from "@workspace/db";

export type ReadinessCheck = {
  key: string;
  status: "pass" | "fail" | "warn";
  summary: string;
};

export type OperationalReadiness = {
  status: "ready" | "not_ready";
  generatedAt: string;
  checks: ReadinessCheck[];
  totals: {
    agents: number;
    routableAgents: number;
    healthyRuntimeInstances: number;
    tasks: number;
    workRequests: number;
    pendingApprovals: number;
  };
};

function emptyTotals(): OperationalReadiness["totals"] {
  return { agents: 0, routableAgents: 0, healthyRuntimeInstances: 0, tasks: 0, workRequests: 0, pendingApprovals: 0 };
}

function isRoutableAgent(agent: typeof agentsTable.$inferSelect): boolean {
  return Boolean(
    agent.isPluggedIn ||
      agent.endpoint ||
      agent.inboundToken ||
      (agent.provider && agent.model),
  );
}

export async function getOperationalReadiness(): Promise<OperationalReadiness> {
  const checks: ReadinessCheck[] = [];

  try {
    await db.execute(sql`select 1 as ok`);
    checks.push({ key: "database", status: "pass", summary: "Database reachable" });
  } catch {
    return {
      status: "not_ready",
      generatedAt: new Date().toISOString(),
      checks: [{ key: "database", status: "fail", summary: "Database unavailable" }],
      totals: emptyTotals(),
    };
  }

  try {
    const [agents, runtimeInstances, [taskCount], [workRequestCount], [pendingApprovalCount]] = await Promise.all([
      db.select().from(agentsTable).orderBy(agentsTable.id),
      db.select().from(agentRuntimeInstancesTable),
      db.select({ count: count() }).from(tasksTable),
      db.select({ count: count() }).from(workRequestsTable),
      db.select({ count: count() }).from(approvalsTable).where(eq(approvalsTable.status, "pending")),
    ]);

    const routableAgents = agents.filter(isRoutableAgent);
    const healthyRuntimeInstances = runtimeInstances.filter(
      (runtime) =>
        runtime.status === "running" &&
        ["healthy", "ready", "online"].includes(runtime.health.toLowerCase()),
    );

    checks.push({
      key: "agents",
      status: agents.length > 0 ? "pass" : "fail",
      summary: agents.length > 0 ? `${agents.length} employee${agents.length === 1 ? "" : "s"} registered` : "No AI employees registered",
    });
    checks.push({
      key: "routing",
      status: routableAgents.length > 0 ? "pass" : "fail",
      summary: routableAgents.length > 0 ? `${routableAgents.length} employee${routableAgents.length === 1 ? "" : "s"} routable for work` : "No employee has a usable runtime route",
    });
    checks.push({
      key: "runtime",
      status: runtimeInstances.length === 0 ? "warn" : healthyRuntimeInstances.length > 0 ? "pass" : "warn",
      summary:
        runtimeInstances.length === 0
          ? "No managed runtime instances recorded; adapter-based workers may still operate"
          : `${healthyRuntimeInstances.length}/${runtimeInstances.length} managed runtime instance${runtimeInstances.length === 1 ? "" : "s"} healthy`,
    });
    checks.push({ key: "tasks", status: "pass", summary: "Task store readable" });
    checks.push({ key: "execution_control_plane", status: "pass", summary: "Execution and approval stores readable" });

    return {
      status: checks.some((check) => check.status === "fail") ? "not_ready" : "ready",
      generatedAt: new Date().toISOString(),
      checks,
      totals: {
        agents: agents.length,
        routableAgents: routableAgents.length,
        healthyRuntimeInstances: healthyRuntimeInstances.length,
        tasks: taskCount?.count ?? 0,
        workRequests: workRequestCount?.count ?? 0,
        pendingApprovals: pendingApprovalCount?.count ?? 0,
      },
    };
  } catch {
    checks.push({ key: "operational_schema", status: "fail", summary: "One or more critical operational tables are unavailable" });
    return {
      status: "not_ready",
      generatedAt: new Date().toISOString(),
      checks,
      totals: emptyTotals(),
    };
  }
}
