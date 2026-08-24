import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import {
  db,
  agentsTable,
  runtimeHostsTable,
  secretsVaultTable,
  employeeTemplatesTable,
  agentRuntimeInstancesTable,
  agentSecretGrantsTable,
} from "@workspace/db";
import { decryptSecret } from "../lib/security.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OPENCLAW_MODEL = "openrouter/auto";

type ProvisionEmployeeInput = {
  name: string;
  role: string;
  department: string;
  business?: string | null;
  owner?: string | null;
  responsibilities?: string | null;
  runtimeHostId: number;
  runtimeType?: string | null;
  provider?: string | null;
  model?: string | null;
  secretId?: number | null;
  templateId?: number | null;
};

type CliResult = { stdout: string; stderr: string };

function slugify(value: string): string {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "employee";
}

function renderTemplate(template: string | null | undefined, values: Record<string, string>): string {
  let result = template ?? "";
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result.trim() + "\n";
}

function assertManagedPath(rootDir: string, candidate: string): void {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(candidate);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to manage workspace outside runtime root: ${resolved}`);
  }
}

async function runCli(cliPath: string, args: string[], env: NodeJS.ProcessEnv): Promise<CliResult> {
  const result = await execFileAsync(cliPath, args, {
    env,
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

async function upsertEnvValue(filePath: string, key: string, value: string): Promise<void> {
  let existing = "";
  try { existing = await fs.readFile(filePath, "utf8"); } catch {}
  const lines = existing.split(/\r?\n/).filter(Boolean).filter(line => !line.startsWith(`${key}=`));
  lines.push(`${key}=${value}`);
  await fs.writeFile(filePath, lines.join("\n") + "\n", { mode: 0o600 });
  await fs.chmod(filePath, 0o600);
}

async function ensureOpenRouterConfigured(rootDir: string, cliPath: string, secret: string): Promise<NodeJS.ProcessEnv> {
  await fs.mkdir(rootDir, { recursive: true, mode: 0o700 });
  const envPath = path.join(rootDir, ".env");
  await upsertEnvValue(envPath, "OPENROUTER_API_KEY", secret);
  const env = { ...process.env, HOME: "/root", OPENROUTER_API_KEY: secret };

  const configPath = path.join(rootDir, "openclaw.json");
  let config = "";
  try { config = await fs.readFile(configPath, "utf8"); } catch {}
  if (!config.includes("openrouter")) {
    await runCli(cliPath, [
      "onboard",
      "--non-interactive",
      "--accept-risk",
      "--skip-health",
      "--mode", "local",
      "--auth-choice", "openrouter-api-key",
      "--secret-input-mode", "ref",
    ], env);
  }
  return env;
}

async function provisionOpenClaw(
  agent: typeof agentsTable.$inferSelect,
  host: typeof runtimeHostsTable.$inferSelect,
  template: typeof employeeTemplatesTable.$inferSelect | null,
  secretValue: string,
  input: ProvisionEmployeeInput,
): Promise<typeof agentRuntimeInstancesTable.$inferSelect> {
  const cliPath = host.cliPath?.trim() || "openclaw";
  const runtimeAgentId = `${slugify(agent.name)}-${agent.id}`;
  const workspacePath = path.join(host.rootDir, `workspace-${runtimeAgentId}`);
  assertManagedPath(host.rootDir, workspacePath);

  const env = await ensureOpenRouterConfigured(host.rootDir, cliPath, secretValue);
  const model = input.model?.trim() || template?.model?.trim() || DEFAULT_OPENCLAW_MODEL;

  await fs.mkdir(workspacePath, { recursive: true, mode: 0o700 });
  await runCli(cliPath, [
    "agents", "add", runtimeAgentId,
    "--workspace", workspacePath,
    "--model", model,
    "--non-interactive",
    "--json",
  ], env);

  const values = {
    name: agent.name,
    role: agent.role,
    department: agent.department,
    business: input.business?.trim() || "Assigned business",
    owner: input.owner?.trim() || "Owner",
    responsibilities: input.responsibilities?.trim() || agent.responsibilities || "Complete assigned work safely and report outcomes clearly.",
  };

  const identity = template?.identityTemplate || "# {{name}}\n\nRole: {{role}}\nDepartment: {{department}}\nBusiness: {{business}}";
  const soul = template?.soulTemplate || "# Working style\n\nAct like a dependable employee. Be proactive, factual, concise, and never claim work that was not completed.";
  const agents = template?.agentTemplate || "# Responsibilities\n\n{{responsibilities}}\n\nUse assigned tools and skills only. Escalate approval-required actions.";
  const user = template?.userTemplate || "# People and business context\n\nBusiness: {{business}}\nPrimary owner: {{owner}}";

  await Promise.all([
    fs.writeFile(path.join(workspacePath, "IDENTITY.md"), renderTemplate(identity, values), "utf8"),
    fs.writeFile(path.join(workspacePath, "SOUL.md"), renderTemplate(soul, values), "utf8"),
    fs.writeFile(path.join(workspacePath, "AGENTS.md"), renderTemplate(agents, values), "utf8"),
    fs.writeFile(path.join(workspacePath, "USER.md"), renderTemplate(user, values), "utf8"),
  ]);

  await runCli(cliPath, ["agents", "set-identity", "--agent", runtimeAgentId, "--from-identity", "--json"], env);
  await runCli(cliPath, ["gateway", "restart"], env);
  const listed = await runCli(cliPath, ["agents", "list", "--json"], env);
  if (!listed.stdout.includes(runtimeAgentId)) throw new Error("OpenClaw agent was created but failed post-provision verification.");

  const [instance] = await db.update(agentRuntimeInstancesTable).set({
    runtimeAgentId,
    workspacePath,
    model,
    status: "running",
    health: "healthy",
    lastError: null,
    provisionedAt: new Date(),
    lastHealthCheck: new Date(),
    updatedAt: new Date(),
  }).where(eq(agentRuntimeInstancesTable.agentId, agent.id)).returning();

  await db.update(runtimeHostsTable).set({ status: "healthy", lastHealthCheck: new Date(), updatedAt: new Date() }).where(eq(runtimeHostsTable.id, host.id));
  await db.update(agentsTable).set({ status: "active", isPluggedIn: true, lastActive: "runtime provisioned", lastPing: new Date() }).where(eq(agentsTable.id, agent.id));
  return instance;
}

export async function provisionEmployee(input: ProvisionEmployeeInput) {
  const [host] = await db.select().from(runtimeHostsTable).where(eq(runtimeHostsTable.id, input.runtimeHostId));
  if (!host) throw new Error("Runtime host not found.");
  if (host.hostType !== "local") throw new Error("Agent Provisioning V1 supports managed local runtime hosts only.");

  let template: typeof employeeTemplatesTable.$inferSelect | null = null;
  if (input.templateId) {
    [template] = await db.select().from(employeeTemplatesTable).where(eq(employeeTemplatesTable.id, input.templateId));
    if (!template) throw new Error("Employee template not found.");
  }

  const runtimeType = input.runtimeType?.trim() || template?.runtimeType || host.runtimeType;
  if (runtimeType !== host.runtimeType) throw new Error(`Runtime host ${host.name} does not support ${runtimeType}.`);

  let secret: typeof secretsVaultTable.$inferSelect | null = null;
  if (input.secretId) {
    [secret] = await db.select().from(secretsVaultTable).where(and(eq(secretsVaultTable.id, input.secretId), eq(secretsVaultTable.status, "active")));
  }
  if (runtimeType === "openclaw" && !secret) throw new Error("OpenClaw provisioning requires an active model-provider secret.");

  const initials = input.name.trim().split(/\s+/).map(word => word[0]).join("").toUpperCase().slice(0, 2) || "AI";
  const [agent] = await db.insert(agentsTable).values({
    name: input.name.trim(),
    role: input.role.trim(),
    department: input.department.trim(),
    responsibilities: input.responsibilities?.trim() || `${input.role.trim()} for ${input.business?.trim() || "assigned business"}.`,
    avatarInitials: initials,
    isLead: false,
    status: "pending",
    lastActive: "provisioning requested",
    isPluggedIn: false,
    provider: runtimeType,
    model: input.model?.trim() || template?.model || DEFAULT_OPENCLAW_MODEL,
    endpoint: null,
    apiKey: null,
  }).returning();

  await db.insert(agentRuntimeInstancesTable).values({
    agentId: agent.id,
    runtimeHostId: host.id,
    runtimeType,
    model: input.model?.trim() || template?.model || DEFAULT_OPENCLAW_MODEL,
    status: "provisioning",
    health: "unknown",
  });

  if (secret) {
    await db.insert(agentSecretGrantsTable).values({ agentId: agent.id, secretId: secret.id, purpose: "model_provider" }).onConflictDoNothing();
  }

  try {
    if (runtimeType !== "openclaw") throw new Error(`Runtime ${runtimeType} is registered but automated provisioning is not implemented in V1.`);
    const secretValue = decryptSecret(secret?.encryptedValue);
    if (!secretValue) throw new Error("Selected provider secret could not be decrypted.");
    const instance = await provisionOpenClaw(agent, host, template, secretValue, input);
    const [updatedAgent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agent.id));
    return { agent: updatedAgent, instance };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provisioning failed.";
    await db.update(agentRuntimeInstancesTable).set({ status: "error", health: "unhealthy", lastError: message, updatedAt: new Date() }).where(eq(agentRuntimeInstancesTable.agentId, agent.id));
    await db.update(agentsTable).set({ status: "error", isPluggedIn: false, lastActive: "runtime provisioning failed" }).where(eq(agentsTable.id, agent.id));
    throw error;
  }
}

export async function runtimeAction(agentId: number, action: "start" | "stop" | "restart" | "health" | "decommission") {
  const [instance] = await db.select().from(agentRuntimeInstancesTable).where(eq(agentRuntimeInstancesTable.agentId, agentId));
  if (!instance) throw new Error("Runtime instance not found.");
  const [host] = instance.runtimeHostId ? await db.select().from(runtimeHostsTable).where(eq(runtimeHostsTable.id, instance.runtimeHostId)) : [];
  if (!host) throw new Error("Runtime host not found.");
  if (instance.runtimeType !== "openclaw") throw new Error("Lifecycle automation is currently implemented for OpenClaw runtimes only.");

  const cliPath = host.cliPath?.trim() || "openclaw";
  const env = { ...process.env, HOME: "/root" };

  if (action === "stop") {
    await db.update(agentsTable).set({ isPluggedIn: false, status: "paused", lastActive: "paused by owner" }).where(eq(agentsTable.id, agentId));
    await db.update(agentRuntimeInstancesTable).set({ status: "paused", updatedAt: new Date() }).where(eq(agentRuntimeInstancesTable.agentId, agentId));
    return { ok: true, action, status: "paused" };
  }

  if (action === "start") {
    await runCli(cliPath, ["gateway", "start"], env);
    await db.update(agentsTable).set({ isPluggedIn: true, status: "active", lastActive: "resumed by owner", lastPing: new Date() }).where(eq(agentsTable.id, agentId));
    await db.update(agentRuntimeInstancesTable).set({ status: "running", health: "healthy", lastHealthCheck: new Date(), updatedAt: new Date() }).where(eq(agentRuntimeInstancesTable.agentId, agentId));
    return { ok: true, action, status: "running" };
  }

  if (action === "restart") {
    await runCli(cliPath, ["gateway", "restart"], env);
  }

  if (action === "decommission") {
    if (instance.runtimeAgentId) await runCli(cliPath, ["agents", "delete", instance.runtimeAgentId, "--force", "--json"], env);
    await db.update(agentRuntimeInstancesTable).set({ status: "decommissioned", health: "offline", updatedAt: new Date() }).where(eq(agentRuntimeInstancesTable.agentId, agentId));
    await db.update(agentsTable).set({ isPluggedIn: false, status: "idle", lastActive: "runtime decommissioned" }).where(eq(agentsTable.id, agentId));
    return { ok: true, action, status: "decommissioned" };
  }

  const listed = await runCli(cliPath, ["agents", "list", "--json"], env);
  const healthy = Boolean(instance.runtimeAgentId && listed.stdout.includes(instance.runtimeAgentId));
  await db.update(agentRuntimeInstancesTable).set({ health: healthy ? "healthy" : "unhealthy", lastHealthCheck: new Date(), updatedAt: new Date() }).where(eq(agentRuntimeInstancesTable.agentId, agentId));
  await db.update(runtimeHostsTable).set({ status: healthy ? "healthy" : "degraded", lastHealthCheck: new Date(), updatedAt: new Date() }).where(eq(runtimeHostsTable.id, host.id));
  return { ok: healthy, action, status: healthy ? "healthy" : "unhealthy" };
}
