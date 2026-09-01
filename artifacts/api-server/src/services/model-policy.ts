import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type ModelPolicyClass = "free" | "economy" | "balanced" | "strong";
export type ModelCostClass = "free" | "low" | "standard" | "high";
export type ModelTaskClass = "research" | "marketing" | "coding" | "finance" | "orchestration" | "general";

export type ModelPolicy = {
  agentId: number | null;
  policyClass: ModelPolicyClass;
  provider: string;
  primaryModel: string;
  fallbackModel: string | null;
  maxCostClass: ModelCostClass;
  allowEscalation: boolean;
  escalationConditions: string[];
};

export const MODEL_POLICY_DEFAULTS: Record<ModelTaskClass, Omit<ModelPolicy, "agentId">> = {
  research: {
    policyClass: "free",
    provider: "openrouter",
    primaryModel: "openrouter/free",
    fallbackModel: "openrouter/auto",
    maxCostClass: "free",
    allowEscalation: true,
    escalationConditions: ["free router unavailable", "required capability missing", "James explicitly approves stronger reasoning"],
  },
  marketing: {
    policyClass: "economy",
    provider: "openrouter",
    primaryModel: "openrouter/auto",
    fallbackModel: "openrouter/free",
    maxCostClass: "low",
    allowEscalation: true,
    escalationConditions: ["quality check fails", "high-stakes external copy", "complex multi-source synthesis"],
  },
  coding: {
    policyClass: "balanced",
    provider: "openrouter",
    primaryModel: "openrouter/auto",
    fallbackModel: null,
    maxCostClass: "standard",
    allowEscalation: true,
    escalationConditions: ["tests repeatedly fail", "security-sensitive change", "architecture decision", "complex debugging after delegated retries"],
  },
  finance: {
    policyClass: "strong",
    provider: "openrouter",
    primaryModel: "openrouter/auto",
    fallbackModel: null,
    maxCostClass: "high",
    allowEscalation: true,
    escalationConditions: ["material reconciliation uncertainty", "conflicting financial evidence", "protected financial decision"],
  },
  orchestration: {
    policyClass: "strong",
    provider: "openrouter",
    primaryModel: "openrouter/auto",
    fallbackModel: null,
    maxCostClass: "high",
    allowEscalation: true,
    escalationConditions: ["cross-system ambiguity", "high-risk supervisory review", "repeated worker failure", "owner-level decision preparation"],
  },
  general: {
    policyClass: "economy",
    provider: "openrouter",
    primaryModel: "openrouter/auto",
    fallbackModel: "openrouter/free",
    maxCostClass: "low",
    allowEscalation: true,
    escalationConditions: ["quality check fails", "task becomes high risk or specialist"],
  },
};

export function classifyModelTask(role: string | null | undefined, instructions = ""): ModelTaskClass {
  const value = `${role ?? ""} ${instructions}`.toLowerCase();
  if (/orchestrat|supervis|chief of staff|manager|james/.test(value)) return "orchestration";
  if (/financial|finance|account|reconcil|banking|expense|payroll|amanda/.test(value)) return "finance";
  if (/code|coding|developer|engineer|typescript|javascript|python|bug|github|pull request|repository|deploy/.test(value)) return "coding";
  if (/research|analyst|intelligence|trend|search|summari[sz]e/.test(value)) return "research";
  if (/marketing|content|copy|campaign|seo|social/.test(value)) return "marketing";
  return "general";
}

export function defaultPolicyFor(taskClass: ModelTaskClass): ModelPolicy {
  return { agentId: null, ...MODEL_POLICY_DEFAULTS[taskClass] };
}

export function openRouterCostTier(policy: ModelPolicy): "low" | "medium" | "high" | "max" {
  if (policy.maxCostClass === "free" || policy.maxCostClass === "low") return "low";
  if (policy.maxCostClass === "standard") return "medium";
  return "high";
}

export async function getAgentModelPolicy(agentId: number, role?: string | null, instructions = ""): Promise<ModelPolicy> {
  const result = await db.execute(sql`
    SELECT agent_id, policy_class, provider, primary_model, fallback_model, max_cost_class, allow_escalation, escalation_conditions
    FROM agent_model_policies WHERE agent_id = ${agentId} LIMIT 1
  `);
  const row = result.rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return { ...defaultPolicyFor(classifyModelTask(role, instructions)), agentId };
  return {
    agentId,
    policyClass: String(row.policy_class) as ModelPolicyClass,
    provider: String(row.provider),
    primaryModel: String(row.primary_model),
    fallbackModel: row.fallback_model ? String(row.fallback_model) : null,
    maxCostClass: String(row.max_cost_class) as ModelCostClass,
    allowEscalation: row.allow_escalation !== false,
    escalationConditions: Array.isArray(row.escalation_conditions) ? row.escalation_conditions.map(String) : [],
  };
}

export async function upsertAgentModelPolicy(policy: ModelPolicy): Promise<void> {
  if (!policy.agentId) throw new Error("agentId is required for a persisted model policy");
  await db.execute(sql`
    INSERT INTO agent_model_policies (agent_id, policy_class, provider, primary_model, fallback_model, max_cost_class, allow_escalation, escalation_conditions, updated_at)
    VALUES (${policy.agentId}, ${policy.policyClass}, ${policy.provider}, ${policy.primaryModel}, ${policy.fallbackModel}, ${policy.maxCostClass}, ${policy.allowEscalation}, ${JSON.stringify(policy.escalationConditions)}::jsonb, now())
    ON CONFLICT (agent_id) DO UPDATE SET
      policy_class = EXCLUDED.policy_class,
      provider = EXCLUDED.provider,
      primary_model = EXCLUDED.primary_model,
      fallback_model = EXCLUDED.fallback_model,
      max_cost_class = EXCLUDED.max_cost_class,
      allow_escalation = EXCLUDED.allow_escalation,
      escalation_conditions = EXCLUDED.escalation_conditions,
      updated_at = now()
  `);
}

export async function seedRolePolicy(agent: { id: number; name: string; role: string; model?: string | null; provider?: string | null }): Promise<ModelPolicy> {
  const taskClass = classifyModelTask(`${agent.name} ${agent.role}`);
  const policy = { ...defaultPolicyFor(taskClass), agentId: agent.id };
  await db.execute(sql`
    INSERT INTO agent_model_policies (agent_id, policy_class, provider, primary_model, fallback_model, max_cost_class, allow_escalation, escalation_conditions)
    VALUES (${agent.id}, ${policy.policyClass}, ${policy.provider}, ${policy.primaryModel}, ${policy.fallbackModel}, ${policy.maxCostClass}, ${policy.allowEscalation}, ${JSON.stringify(policy.escalationConditions)}::jsonb)
    ON CONFLICT (agent_id) DO NOTHING
  `);
  return getAgentModelPolicy(agent.id, agent.role);
}

export async function recordModelUsage(input: {
  agentId: number;
  taskId?: number | null;
  provider: string;
  model: string;
  policyClass?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
  success: boolean;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO model_usage_events (agent_id, task_id, provider, model, policy_class, input_tokens, output_tokens, total_tokens, cost_usd, success)
    VALUES (${input.agentId}, ${input.taskId ?? null}, ${input.provider}, ${input.model}, ${input.policyClass ?? null}, ${input.inputTokens ?? null}, ${input.outputTokens ?? null}, ${input.totalTokens ?? null}, ${input.costUsd ?? null}, ${input.success})
  `);
}
