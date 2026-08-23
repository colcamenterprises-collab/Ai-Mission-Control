import { and, eq, gt, isNull, or } from "drizzle-orm";
import { agentExecutionScopesTable, agentsTable, db } from "@workspace/db";
import { evaluateAgentEligibility, normalizeRequirements } from "./execution-permissions.js";
import { listSkills } from "./skills.js";
import { listSharedSkills } from "./shared-skills.js";

export type RoutedSkill = {
  id: string;
  name: string;
  version: string | null;
  provenance: string;
  selectionReason: string;
};

export type CapabilityRoutingResult = {
  agentId: number | null;
  agentName: string | null;
  routingReason: string;
  skills: RoutedSkill[];
};

function terms(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3))];
}

function overlapScore(haystack: string, needles: string[]): number {
  const normalized = haystack.toLowerCase();
  return needles.reduce((score, token) => score + (normalized.includes(token) ? 1 : 0), 0);
}

export async function resolveCapabilities(requestedAction: string, rawRequirements: unknown): Promise<CapabilityRoutingResult> {
  const requirements = normalizeRequirements(rawRequirements);
  const requiredCapabilities = requirements.capabilities ?? [];

  // Preserve the ordinary blocked lifecycle for requests that do not provide
  // routing requirements. No skill scan is necessary and a vault problem must
  // never prevent the execution record from being created.
  if (requiredCapabilities.length === 0) {
    return {
      agentId: null,
      agentName: null,
      routingReason: "UNASSIGNED: capability routing requires requirements.capabilities",
      skills: [],
    };
  }

  const searchTerms = [...terms(requestedAction), ...requiredCapabilities.flatMap(terms)];
  const native = await listSkills({});
  const shared = await listSharedSkills();
  const candidateSkills = [...native.skills, ...shared.skills]
    .filter((skill) => skill.source.enabled !== false)
    .filter((skill) => skill.source.sourceRepo !== "obsidian-vault" || skill.status === "approved")
    .map((skill) => {
      const text = [skill.name, skill.title, skill.description ?? "", skill.category, skill.path].join(" ");
      return { skill, score: overlapScore(text, searchTerms) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.title.localeCompare(b.skill.title))
    .slice(0, 8)
    .map(({ skill, score }) => ({
      id: skill.id,
      name: skill.title || skill.name,
      version: skill.source.commitHash ?? null,
      provenance: skill.source.sourceRepo ?? skill.source.sourceLabel ?? "local",
      selectionReason: `Matched ${score} capability/action term${score === 1 ? "" : "s"}`,
    }));

  const now = new Date();
  const [agents, grants] = await Promise.all([
    db.select().from(agentsTable).where(eq(agentsTable.isPluggedIn, true)),
    db.select().from(agentExecutionScopesTable).where(
      and(
        eq(agentExecutionScopesTable.scopeType, "capability"),
        or(isNull(agentExecutionScopesTable.expiresAt), gt(agentExecutionScopesTable.expiresAt, now)),
      ),
    ),
  ]);
  const grantsByAgent = new Map<number, Set<string>>();
  for (const grant of grants) {
    const values = grantsByAgent.get(grant.agentId) ?? new Set<string>();
    values.add(grant.scopeValue);
    grantsByAgent.set(grant.agentId, values);
  }

  const eligible: Array<{ agent: typeof agents[number]; score: number }> = [];
  for (const agent of agents) {
    const result = await evaluateAgentEligibility(agent.id, requirements);
    if (!result.eligible) continue;
    const agentGrants = grantsByAgent.get(agent.id) ?? new Set<string>();
    const exactMatches = requiredCapabilities.filter((capability) => agentGrants.has(capability)).length;
    const wildcard = agentGrants.has("*") ? 1 : 0;
    const score = exactMatches * 100 + wildcard * 10 + (agent.isLead ? 3 : 0) + Math.max(0, agent.successRate) / 100;
    eligible.push({ agent, score });
  }

  eligible.sort((a, b) => b.score - a.score || b.agent.tasksCompleted - a.agent.tasksCompleted || a.agent.id - b.agent.id);
  const selected = eligible[0]?.agent ?? null;
  if (!selected) {
    return {
      agentId: null,
      agentName: null,
      routingReason: `UNASSIGNED: no plugged-in agent satisfies capabilities [${requiredCapabilities.join(", ")}]`,
      skills: candidateSkills,
    };
  }

  return {
    agentId: selected.id,
    agentName: selected.name,
    routingReason: `Capability router selected ${selected.name} for [${requiredCapabilities.join(", ")}]; ${candidateSkills.length} relevant skill${candidateSkills.length === 1 ? "" : "s"} attached`,
    skills: candidateSkills,
  };
}
