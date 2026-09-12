export const WORK_REQUEST_STATES = [
  "draft",
  "queued",
  "awaiting_approval",
  "approved",
  "dispatched",
  "acknowledged",
  "running",
  "blocked",
  "completed",
  "failed",
  "rejected",
  "cancelled",
] as const;
export type WorkRequestState = (typeof WORK_REQUEST_STATES)[number];
export type ApprovalDecision =
  | "AUTO_EXECUTE"
  | "ORCHESTRATOR_APPROVAL"
  | "OWNER_APPROVAL"
  | "DENIED";

const transitions: Readonly<
  Record<WorkRequestState, readonly WorkRequestState[]>
> = {
  draft: ["queued", "cancelled"],
  queued: [
    "awaiting_approval",
    "approved",
    "dispatched",
    "blocked",
    "cancelled",
  ],
  awaiting_approval: ["approved", "blocked", "rejected", "cancelled"],
  approved: ["dispatched", "cancelled"],
  dispatched: ["acknowledged", "failed", "cancelled"],
  acknowledged: ["running", "failed", "cancelled"],
  running: ["blocked", "completed", "failed", "cancelled"],
  blocked: ["queued", "awaiting_approval", "failed", "cancelled"],
  completed: [],
  failed: ["queued", "cancelled"],
  rejected: [],
  cancelled: [],
};

export function canTransition(
  from: WorkRequestState,
  to: WorkRequestState,
): boolean {
  return transitions[from].includes(to);
}
export function assertTransition(
  from: WorkRequestState,
  to: WorkRequestState,
): void {
  if (!canTransition(from, to))
    throw new Error(`Invalid work request transition: ${from} -> ${to}`);
}

export type RiskContext = {
  riskLevel: number;
  agentCanAutoApprove?: boolean;
  standingOwnerAuthority?: boolean;
  prohibited?: boolean;
};
export function evaluateApproval(input: RiskContext): ApprovalDecision {
  if (
    !Number.isInteger(input.riskLevel) ||
    input.riskLevel < 0 ||
    input.riskLevel > 4
  )
    throw new Error("riskLevel must be an integer from 0 to 4");
  if (input.prohibited || input.riskLevel === 4) return "DENIED";
  if (input.riskLevel <= 1) return "AUTO_EXECUTE";
  if (input.riskLevel === 2)
    return input.agentCanAutoApprove
      ? "ORCHESTRATOR_APPROVAL"
      : "OWNER_APPROVAL";
  return input.standingOwnerAuthority
    ? "ORCHESTRATOR_APPROVAL"
    : "OWNER_APPROVAL";
}

const sensitiveKey =
  /(authorization|api[-_]?key|token|secret|password|credential|cookie)/i;
const bearer = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const tokenLike = /\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[_A-Za-z0-9-]{8,}\b/g;
export function redactSensitive(value: unknown): unknown {
  if (typeof value === "string")
    return value
      .replace(bearer, "Bearer [REDACTED]")
      .replace(tokenLike, "[REDACTED]");
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redactSensitive(item),
      ]),
    );
  return value;
}


export type DelegationLevel = 0 | 1 | 2 | 3 | 4;
export type ActionClass = "observe" | "routine" | "controlled" | "protected" | "prohibited";
export type DelegationAssessment = { riskLevel: DelegationLevel; actionClass: ActionClass; approvalDecision: ApprovalDecision; reason: string; signals: string[] };

const PROTECTED_EXTERNAL_SIGNALS: Array<{ name: string; pattern: RegExp }> = [
  { name: "financial_movement", pattern: /\b(pay|payment|transfer|refund|withdraw|purchase|spend|buy|invoice payment|bank transfer|cash out)\b/i },
  { name: "credentials_security", pattern: /\b(password|credential|secret|api key|token|rotate key|security setting|encryption key)\b/i },
  { name: "destructive_production", pattern: /\b(drop|truncate|delete database|delete table|wipe|destroy|purge|production database|prod database)\b/i },
  { name: "legal_commitment", pattern: /\b(sign|execute|accept)\b.{0,40}\b(contract|agreement|terms|legal)\b/i },
  { name: "external_commitment", pattern: /\b(send|publish|post|promise|commit|confirm)\b.{0,50}\b(customer|client|public|external|supplier|vendor)\b/i },
  { name: "privilege_escalation", pattern: /\b(grant|elevate|admin|sudo|root|permission|role)\b.{0,40}\b(access|permission|privilege|admin|root)\b/i },
];
const CONTROLLED_EXTERNAL_SIGNALS: Array<{ name: string; pattern: RegExp }> = [
  { name: "software_change", pattern: /\b(deploy|merge|release|install|restart|reconfigure|patch|change|update|edit|fix|create|write)\b/i },
  { name: "operational_change", pattern: /\b(schedule|assign|reassign|archive|move|enable|disable|approve|reject|cancel)\b/i },
];
const OBSERVE_EXTERNAL_SIGNALS: Array<{ name: string; pattern: RegExp }> = [
  { name: "question", pattern: /^\s*(what|why|when|where|who|how|is|are|can|could|does|do|did|has|have|show|tell)\b/i },
  { name: "analysis", pattern: /\b(check|review|analyse|analyze|inspect|summari[sz]e|report|compare|explain|read|look up|find|status)\b/i },
];

/** External language is classified into a structured risk decision; only the structured decision grants authority. Ambiguity fails closed at L2. */
export function assessExternalAction(action: string): DelegationAssessment {
  const text = action.trim();
  const protectedSignals = PROTECTED_EXTERNAL_SIGNALS.filter(item => item.pattern.test(text)).map(item => item.name);
  if (protectedSignals.length) return { riskLevel: 3, actionClass: "protected", approvalDecision: "OWNER_APPROVAL", reason: `External request contains protected-action signals: ${protectedSignals.join(", ")}.`, signals: protectedSignals };
  const controlledSignals = CONTROLLED_EXTERNAL_SIGNALS.filter(item => item.pattern.test(text)).map(item => item.name);
  if (controlledSignals.length) return { riskLevel: 2, actionClass: "controlled", approvalDecision: "ORCHESTRATOR_APPROVAL", reason: `External request proposes a controlled side effect: ${controlledSignals.join(", ")}.`, signals: controlledSignals };
  const observeSignals = OBSERVE_EXTERNAL_SIGNALS.filter(item => item.pattern.test(text)).map(item => item.name);
  if (observeSignals.length) return { riskLevel: 1, actionClass: "observe", approvalDecision: "AUTO_EXECUTE", reason: `External request is observational/read-only: ${observeSignals.join(", ")}.`, signals: observeSignals };
  if (/^\s*(hello|hi|hey|thanks|thank you|ok|okay|noted|received)[.! ]*$/i.test(text)) return { riskLevel: 1, actionClass: "routine", approvalDecision: "AUTO_EXECUTE", reason: "External request is harmless conversational acknowledgement with no requested side effect.", signals: ["benign_conversation"] };
  return { riskLevel: 2, actionClass: "controlled", approvalDecision: "ORCHESTRATOR_APPROVAL", reason: "Unclassified external request defaults to controlled execution and requires orchestrator authorization.", signals: ["ambiguous_external_action"] };
}
