import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  classifyModelTask,
  defaultPolicyFor,
  type ModelCostClass,
  type ModelPolicy,
  type ModelPolicyClass,
} from "./model-policy-rules.js";

export * from "./model-policy-rules.js";

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
