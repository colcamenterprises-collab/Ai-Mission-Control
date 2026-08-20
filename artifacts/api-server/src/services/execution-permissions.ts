import { and, eq, gt, isNull, or } from "drizzle-orm";
import {
  agentExecutionScopesTable,
  agentToolAccessTable,
  db,
} from "@workspace/db";

export type ExecutionRequirements = {
  capabilities?: string[];
  tools?: number[];
  repositories?: string[];
  projects?: string[];
  businesses?: string[];
  environments?: string[];
  memoryScopes?: string[];
};

export type EligibilityResult = {
  eligible: boolean;
  code: "ELIGIBLE" | "INSUFFICIENT_PERMISSIONS";
  missing: string[];
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
        .map((item) => item.trim())
    : [];
}

export function normalizeRequirements(value: unknown): ExecutionRequirements {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    capabilities: strings(source.capabilities),
    tools: Array.isArray(source.tools)
      ? (source.tools.filter(Number.isInteger) as number[])
      : [],
    repositories: strings(source.repositories),
    projects: strings(source.projects),
    businesses: strings(source.businesses),
    environments: strings(source.environments),
    memoryScopes: strings(source.memoryScopes),
  };
}

export async function evaluateAgentEligibility(
  agentId: number,
  raw: unknown,
): Promise<EligibilityResult> {
  const requirements = normalizeRequirements(raw);
  const now = new Date();
  const grants = await db
    .select()
    .from(agentExecutionScopesTable)
    .where(
      and(
        eq(agentExecutionScopesTable.agentId, agentId),
        or(
          isNull(agentExecutionScopesTable.expiresAt),
          gt(agentExecutionScopesTable.expiresAt, now),
        ),
      ),
    );
  const toolRows = await db
    .select({ toolId: agentToolAccessTable.toolId })
    .from(agentToolAccessTable)
    .where(eq(agentToolAccessTable.agentId, agentId));
  const keys = new Set(
    grants.map((grant) => `${grant.scopeType}:${grant.scopeValue}`),
  );
  const toolIds = new Set(toolRows.map((row) => row.toolId));
  const missing: string[] = [];
  const check = (type: string, values: string[] | undefined) =>
    values?.forEach((value) => {
      if (!keys.has(`${type}:${value}`) && !keys.has(`${type}:*`))
        missing.push(`${type}:${value}`);
    });
  check("capability", requirements.capabilities);
  check("repository", requirements.repositories);
  check("project", requirements.projects);
  check("business", requirements.businesses);
  check("environment", requirements.environments);
  check("memory", requirements.memoryScopes);
  requirements.tools?.forEach((id) => {
    if (!toolIds.has(id)) missing.push(`tool:${id}`);
  });
  return {
    eligible: missing.length === 0,
    code: missing.length ? "INSUFFICIENT_PERMISSIONS" : "ELIGIBLE",
    missing,
  };
}
