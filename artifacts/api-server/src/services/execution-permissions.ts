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

/**
 * Company capabilities are shared infrastructure, not employee permissions.
 * An authenticated employee may use the systems, skills, memory and knowledge
 * needed for assigned work. Consequential/destructive actions remain governed
 * by the execution policy and approval workflow rather than duplicated grants.
 */
export async function evaluateAgentEligibility(
  _agentId: number,
  _raw: unknown,
): Promise<EligibilityResult> {
  return {
    eligible: true,
    code: "ELIGIBLE",
    missing: [],
  };
}
