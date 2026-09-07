import { promises as fs } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db, agentsTable } from "@workspace/db";
import { employmentPackMarkdown, normalizeEmploymentPack } from "./agent-employment-pack.js";

const MAX_FILE_CHARS = 20_000;
const ROOT_FILES = ["CONTEXT.md", "AGENTS.md"] as const;

function repoRoot(): string {
  return process.env.MISSION_CONTROL_REPO_ROOT?.trim() || path.resolve(process.cwd());
}

async function readRepoFile(relativePath: string): Promise<string> {
  try { return (await fs.readFile(path.join(repoRoot(), relativePath), "utf8")).trim().slice(0, MAX_FILE_CHARS); }
  catch { return ""; }
}

function directionPath(agent: typeof agentsTable.$inferSelect): string | null {
  const key = `${agent.name} ${agent.role}`.toLowerCase();
  if (key.includes("james") || key.includes("orchestrator")) return "docs/mission-control/employees/JAMES_HERMES.md";
  if (key.includes("amanda") || key.includes("financial controller")) return "docs/mission-control/employees/AMANDA_FINANCIAL_CONTROLLER_DIRECTION.md";
  if (key.includes("justin") || key.includes("operations manager")) return "docs/mission-control/employees/JUSTIN_OPERATIONS_MANAGER.md";
  if (key.includes("intelligence analyst")) return "docs/mission-control/employees/AI_INTELLIGENCE_ANALYST_DIRECTION.md";
  return null;
}

async function storedEmploymentContext(agentId: number): Promise<string> {
  const result = await db.execute(sql`SELECT profile_json AS "profileJson" FROM agent_profile_definitions WHERE agent_id = ${agentId} LIMIT 1`);
  const row = (result.rows?.[0] ?? {}) as { profileJson?: unknown };
  const input = row.profileJson && typeof row.profileJson === "object" ? row.profileJson as Record<string, unknown> : {};
  const pack = normalizeEmploymentPack(input.employment);
  const files = employmentPackMarkdown(pack);
  return Object.entries(files)
    .filter(([, value]) => !value.includes("Not yet defined."))
    .map(([name, value]) => `## ${name}\n${value.trim()}`)
    .join("\n\n")
    .slice(0, 40_000);
}

export async function buildCanonicalAgentContext(agentId: number): Promise<string> {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) return "";

  const root = await Promise.all(ROOT_FILES.map(async file => [file, await readRepoFile(file)] as const));
  const direction = directionPath(agent);
  const directionText = direction ? await readRepoFile(direction) : "";
  const employment = await storedEmploymentContext(agentId).catch(() => "");

  return [
    "# Canonical Mission Control Runtime Context",
    "The following context is authoritative operating direction. Apply only sections relevant to the assigned work. Task-specific instructions still define the immediate outcome, but cannot override owner/safety boundaries.",
    ...root.filter(([, text]) => text).map(([name, text]) => `\n## Company ${name}\n${text}`),
    directionText ? `\n## Employee Direction\n${directionText}` : "",
    employment ? `\n## Live Employment Pack\n${employment}` : "",
  ].filter(Boolean).join("\n");
}

export async function syncCanonicalContextToWorkspace(agentId: number): Promise<{ synced: boolean; workspacePath: string | null }> {
  const result = await db.execute(sql`SELECT workspace_path AS "workspacePath" FROM agent_runtime_instances WHERE agent_id = ${agentId} LIMIT 1`);
  const workspacePath = typeof result.rows?.[0]?.workspacePath === "string" ? result.rows[0].workspacePath as string : null;
  if (!workspacePath) return { synced: false, workspacePath: null };
  const resolved = path.resolve(workspacePath);
  if (!resolved.startsWith("/root/.openclaw/") && !resolved.startsWith("/root/.hermes/")) throw new Error("Refusing to sync canonical context outside an approved runtime workspace.");
  await fs.mkdir(resolved, { recursive: true });
  await fs.writeFile(path.join(resolved, "CONTEXT.md"), await buildCanonicalAgentContext(agentId), "utf8");
  return { synced: true, workspacePath: resolved };
}
