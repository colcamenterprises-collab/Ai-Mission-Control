import { and, eq } from "drizzle-orm";
import {
  db,
  agentsTable,
  agentExecutionScopesTable,
} from "@workspace/db";

type PublicAgent = Omit<typeof agentsTable.$inferSelect, "apiKey" | "createdAt"> & {
  apiKeyHint: null;
  assignedSkills: string[];
};

// No fake/demo agents in production.
// The AI Team must only show agents that actually exist in the database.
export const OPERATIONAL_AGENTS: PublicAgent[] = [];

export const CURRENT_ORCHESTRATOR_NAME = "Mission Control";
const NO_SKILLS_SENTINEL = "__none__";

// Compatibility defaults are used only to bootstrap durable grants for existing
// agents. Once initialization completes, agent_execution_scopes is authoritative.
const LEGACY_AGENT_SKILLS: Record<string, string[]> = {
  james: ["orchestration"],
  "james hermes": ["orchestration", "coding"],
  hermes: ["orchestration"],
  codex: ["coding"],
  "dev/codex": ["coding"],
  claude: ["orchestration"],
  openai: ["orchestration"],
  openrouter: ["orchestration"],
  gemini: [],
  clawbot: [],
  openclaw: [],
};

let durableAssignmentsLoaded = false;
let durableAssignments = new Map<string, string[]>();

function normalizeSkills(skills: string[]): string[] {
  return [...new Set(skills.map((skill) => skill.trim()).filter((skill) => skill && skill !== NO_SKILLS_SENTINEL))];
}

function legacySkills(agentName: string): string[] {
  return LEGACY_AGENT_SKILLS[agentName.toLowerCase()] ?? [];
}

async function loadDurableAssignments(): Promise<void> {
  const [agents, grants] = await Promise.all([
    db.select({ id: agentsTable.id, name: agentsTable.name }).from(agentsTable),
    db
      .select({
        agentId: agentExecutionScopesTable.agentId,
        skill: agentExecutionScopesTable.scopeValue,
      })
      .from(agentExecutionScopesTable)
      .where(
        and(
          eq(agentExecutionScopesTable.scopeType, "skill"),
          eq(agentExecutionScopesTable.operation, "use"),
        ),
      ),
  ]);

  const byId = new Map<number, string[]>();
  for (const grant of grants) {
    byId.set(grant.agentId, [...(byId.get(grant.agentId) ?? []), grant.skill]);
  }

  durableAssignments = new Map(
    agents.map((agent) => [
      agent.name.toLowerCase(),
      normalizeSkills(byId.get(agent.id) ?? []),
    ]),
  );
  durableAssignmentsLoaded = true;
}

export async function initializeAgentSkillAssignments(): Promise<{
  agents: number;
  bootstrappedGrants: number;
}> {
  const agents = await db
    .select({ id: agentsTable.id, name: agentsTable.name })
    .from(agentsTable);
  const existing = await db
    .select({ agentId: agentExecutionScopesTable.agentId })
    .from(agentExecutionScopesTable)
    .where(
      and(
        eq(agentExecutionScopesTable.scopeType, "skill"),
        eq(agentExecutionScopesTable.operation, "use"),
      ),
    );
  const agentsWithExplicitGrants = new Set(existing.map((row) => row.agentId));
  const bootstrapRows = agents.flatMap((agent) => {
    if (agentsWithExplicitGrants.has(agent.id)) return [];
    const defaults = legacySkills(agent.name);
    if (!defaults.length) return [];
    return defaults.map((skill) => ({
      agentId: agent.id,
      scopeType: "skill",
      scopeValue: skill,
      operation: "use",
      grantedBy: "legacy-bootstrap",
    }));
  });

  if (bootstrapRows.length) {
    await db
      .insert(agentExecutionScopesTable)
      .values(bootstrapRows)
      .onConflictDoNothing();
  }

  await loadDurableAssignments();
  return { agents: agents.length, bootstrappedGrants: bootstrapRows.length };
}

export function getAssignedSkillNamesForAgent(agentName: string): string[] {
  if (!durableAssignmentsLoaded) return legacySkills(agentName);
  return durableAssignments.get(agentName.toLowerCase()) ?? [];
}

export async function setAssignedSkillNamesForAgent(
  agentId: number,
  agentName: string,
  skills: string[],
): Promise<string[]> {
  const normalized = normalizeSkills(skills);
  await db.transaction(async (transaction) => {
    await transaction
      .delete(agentExecutionScopesTable)
      .where(
        and(
          eq(agentExecutionScopesTable.agentId, agentId),
          eq(agentExecutionScopesTable.scopeType, "skill"),
          eq(agentExecutionScopesTable.operation, "use"),
        ),
      );
    await transaction.insert(agentExecutionScopesTable).values(
      (normalized.length ? normalized : [NO_SKILLS_SENTINEL]).map((skill) => ({
        agentId,
        scopeType: "skill",
        scopeValue: skill,
        operation: "use",
        grantedBy: "Mission Control",
      })),
    );
  });

  durableAssignments.set(agentName.toLowerCase(), normalized);
  durableAssignmentsLoaded = true;
  return normalized;
}
