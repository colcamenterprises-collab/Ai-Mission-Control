import type { agentsTable } from "@workspace/db";

type PublicAgent = Omit<typeof agentsTable.$inferSelect, "apiKey" | "createdAt"> & {
  apiKeyHint: null;
  assignedSkills: string[];
};

// No fake/demo agents in production.
// The AI Team must only show agents that actually exist in the database.
export const OPERATIONAL_AGENTS: PublicAgent[] = [];

export const CURRENT_ORCHESTRATOR_NAME = "Mission Control";

const CONFIGURED_AGENT_SKILLS: Record<string, string[]> = {
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

export function getAssignedSkillNamesForAgent(agentName: string): string[] {
  return CONFIGURED_AGENT_SKILLS[agentName.toLowerCase()] ?? [];
}
