export type DelegationRisk = 0 | 1 | 2 | 3 | 4;

export type DelegationDecision = {
  authority: "ORCHESTRATOR" | "OWNER";
  reason: string;
};

export type TaskSupervisionInput = {
  status: string;
  approvalRequired: boolean;
  riskLevel?: number | null;
  approvalDecision?: string | null;
};

const OWNER_DECISIONS = new Set(["OWNER_APPROVAL", "OWNER_REQUIRED", "REQUIRE_OWNER", "MANUAL_APPROVAL", "DENIED"]);
const ORCHESTRATOR_DECISIONS = new Set(["AUTO_EXECUTE", "ORCHESTRATOR_APPROVAL"]);

export function delegationDecision(input: TaskSupervisionInput): DelegationDecision {
  if (input.approvalRequired) {
    return { authority: "OWNER", reason: "Task is explicitly marked as requiring owner approval." };
  }

  const approvalDecision = input.approvalDecision?.toUpperCase();
  if (approvalDecision && OWNER_DECISIONS.has(approvalDecision)) {
    return { authority: "OWNER", reason: `Execution policy requires owner authority (${approvalDecision}).` };
  }
  if (approvalDecision && ORCHESTRATOR_DECISIONS.has(approvalDecision)) {
    return { authority: "ORCHESTRATOR", reason: `Execution policy delegates this action to Mission Control (${approvalDecision}).` };
  }

  const risk = Number.isFinite(Number(input.riskLevel)) ? Number(input.riskLevel) : 0;
  if (risk >= 2) {
    return { authority: "OWNER", reason: `Risk level ${risk} has no explicit orchestrator approval and is outside automatic standing delegation.` };
  }

  return {
    authority: "ORCHESTRATOR",
    reason: `Risk level ${risk} is within automatic standing delegation.`,
  };
}

export function supervisionAction(status: string): string {
  switch (status) {
    case "blocked":
      return "Investigate the blocker, choose a delegated resolution, and resume execution. Escalate only if owner authority is genuinely required.";
    case "changes_required":
      return "Resolve the requested changes with the assigned worker and continue execution until the success criteria are met.";
    case "backlog":
    case "ready":
      return "Confirm the outcome, execution plan and responsible worker, then commence the task.";
    case "running":
    case "in_progress":
      return "Review current progress, resolve any emerging blocker and ensure a concrete next execution step exists.";
    case "completion_pending":
      return "Complete independent supervisory QA and either verify completion or return precise rework instructions.";
    case "review":
      return "Owner review is the active next action.";
    default:
      return "Establish a concrete next action and responsible owner before leaving the task active.";
  }
}

export function isSupervisableTaskStatus(status: string): boolean {
  return ["backlog", "ready", "running", "in_progress", "blocked", "changes_required", "completion_pending", "review"].includes(status);
}
