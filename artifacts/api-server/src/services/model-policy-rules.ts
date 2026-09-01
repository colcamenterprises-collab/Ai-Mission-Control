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
  research: { policyClass: "free", provider: "openrouter", primaryModel: "openrouter/free", fallbackModel: "openrouter/auto", maxCostClass: "free", allowEscalation: true, escalationConditions: ["free router unavailable", "required capability missing", "James explicitly approves stronger reasoning"] },
  marketing: { policyClass: "economy", provider: "openrouter", primaryModel: "openrouter/auto", fallbackModel: "openrouter/free", maxCostClass: "low", allowEscalation: true, escalationConditions: ["quality check fails", "high-stakes external copy", "complex multi-source synthesis"] },
  coding: { policyClass: "balanced", provider: "openrouter", primaryModel: "openrouter/auto", fallbackModel: null, maxCostClass: "standard", allowEscalation: true, escalationConditions: ["tests repeatedly fail", "security-sensitive change", "architecture decision", "complex debugging after delegated retries"] },
  finance: { policyClass: "strong", provider: "openrouter", primaryModel: "openrouter/auto", fallbackModel: null, maxCostClass: "high", allowEscalation: true, escalationConditions: ["material reconciliation uncertainty", "conflicting financial evidence", "protected financial decision"] },
  orchestration: { policyClass: "strong", provider: "openrouter", primaryModel: "openrouter/auto", fallbackModel: null, maxCostClass: "high", allowEscalation: true, escalationConditions: ["cross-system ambiguity", "high-risk supervisory review", "repeated worker failure", "owner-level decision preparation"] },
  general: { policyClass: "economy", provider: "openrouter", primaryModel: "openrouter/auto", fallbackModel: "openrouter/free", maxCostClass: "low", allowEscalation: true, escalationConditions: ["quality check fails", "task becomes high risk or specialist"] },
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

export function defaultPolicyFor(taskClass: ModelTaskClass): ModelPolicy { return { agentId: null, ...MODEL_POLICY_DEFAULTS[taskClass] }; }

export function openRouterCostTier(policy: ModelPolicy): "low" | "medium" | "high" | "max" {
  if (policy.maxCostClass === "free" || policy.maxCostClass === "low") return "low";
  if (policy.maxCostClass === "standard") return "medium";
  return "high";
}
