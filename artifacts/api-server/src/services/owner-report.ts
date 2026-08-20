import type { WorkRequest } from "@workspace/db";
import { redactSensitive } from "./execution-policy.js";

const show = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "UNKNOWN"
    : typeof value === "string"
      ? value
      : JSON.stringify(redactSensitive(value));
export function buildOwnerReport(
  request: WorkRequest,
  output: unknown,
  detail: Record<string, unknown> = {},
): string {
  const requirements = request.requirements as Record<string, unknown>;
  return [
    ["WORK REQUESTED", request.requestedAction],
    ["WORKER USED", detail.worker],
    ["WHY THIS WORKER", request.routingReason],
    ["BUSINESS", request.business],
    ["PROJECT", request.project],
    ["RISK LEVEL", request.riskLevel],
    ["APPROVAL", request.approvalDecision],
    ["CONTEXT USED", detail.context],
    ["MEMORY USED", requirements.memoryScopes],
    ["SKILLS USED", detail.skills],
    ["PLAYBOOKS USED", detail.playbooks],
    ["TOOLS USED", detail.tools],
    ["REPOSITORIES USED", detail.repositories ?? request.repository],
    ["FILES/SYSTEMS CHANGED", detail.changes],
    ["OUTPUT", output],
    ["TESTS/VERIFICATION", detail.verification],
    ["COST", request.providerCost],
    ["BLOCKERS", detail.blockers],
    ["NEXT ACTION", detail.nextAction],
    ["OWNER APPROVAL REQUIRED", detail.ownerApprovalRequired ?? "NO"],
  ]
    .map(([label, value]) => `${label}\n${show(value)}`)
    .join("\n\n");
}
