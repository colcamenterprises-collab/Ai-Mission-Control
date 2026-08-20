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
