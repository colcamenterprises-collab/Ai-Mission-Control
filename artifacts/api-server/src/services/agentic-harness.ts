import { desc, eq } from "drizzle-orm";
import { db, workRequestsTable, type WorkRequest } from "@workspace/db";

export type HarnessEvalId =
  | "evidence_present"
  | "supervisor_verified"
  | "no_unresolved_blockers"
  | "completion_summary_present"
  | "protected_action_authorized";

export type HarnessEval = {
  id: HarnessEvalId;
  required: boolean;
  passed: boolean;
  detail: string;
};

export type ExecutionHarnessContract = {
  version: "1.0";
  completionPolicy: "evidence_gated";
  minimumEvidence: number;
  requiredEvals: HarnessEvalId[];
  capabilityScope: {
    allowed: string[];
    protected: string[];
    expiresWithExecution: true;
  };
  failureReplay: {
    enabled: true;
    retainFailedEvaluations: true;
  };
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim())
    : [];
}

function isAcknowledgementTask(title: string, description: string): boolean {
  return /nothing required|no action required|just checking|checking you are allocated|acknowledge|test allocation|test dispatch/i.test(`${title} ${description}`);
}

function protectedCapabilities(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const capabilities = new Set<string>();
  if (/production|deploy|publish|merge/.test(text)) capabilities.add("production_change");
  if (/delete|drop|destroy|purge|truncate/.test(text)) capabilities.add("destructive_change");
  if (/payment|pay |purchase|spend|refund|bank|transfer/.test(text)) capabilities.add("financial_commitment");
  if (/credential|secret|token|password|permission|security/.test(text)) capabilities.add("security_change");
  if (/customer|client|contract|legal|external commitment/.test(text)) capabilities.add("consequential_external_commitment");
  return [...capabilities];
}

export function buildExecutionHarnessContract(params: {
  title: string;
  description?: string | null;
  approvalRequired: boolean;
}): ExecutionHarnessContract {
  const description = params.description ?? "";
  const acknowledgement = isAcknowledgementTask(params.title, description);
  const protectedActions = protectedCapabilities(params.title, description);
  const requiredEvals: HarnessEvalId[] = [
    "completion_summary_present",
    "supervisor_verified",
    "no_unresolved_blockers",
  ];
  if (!acknowledgement) requiredEvals.unshift("evidence_present");
  if (protectedActions.length > 0) requiredEvals.push("protected_action_authorized");

  return {
    version: "1.0",
    completionPolicy: "evidence_gated",
    minimumEvidence: acknowledgement ? 0 : 1,
    requiredEvals,
    capabilityScope: {
      allowed: [
        "read_assigned_context",
        "use_role_granted_tools",
        "create_reversible_work",
        "report_execution_result",
        "request_approval_or_escalation",
      ],
      protected: protectedActions,
      expiresWithExecution: true,
    },
    failureReplay: {
      enabled: true,
      retainFailedEvaluations: true,
    },
  };
}

export function contractFromRequirements(requirements: unknown): ExecutionHarnessContract | null {
  const harness = record(record(requirements).agenticHarness);
  const contract = record(harness.contract);
  if (contract.version !== "1.0" || contract.completionPolicy !== "evidence_gated") return null;
  return contract as unknown as ExecutionHarnessContract;
}

export function evaluateCompletionContract(params: {
  contract: ExecutionHarnessContract;
  result: JsonRecord;
  approvalDecision?: string | null;
}): { passed: boolean; evals: HarnessEval[] } {
  const evidence = strings(params.result.evidence);
  const summary = typeof params.result.summary === "string" ? params.result.summary.trim() : "";
  const verifiedBy = typeof params.result.verifiedBy === "string" ? params.result.verifiedBy.trim() : "";
  const blockers = strings(params.result.blockers);
  const protectedActions = params.contract.capabilityScope.protected;
  const protectedAuthorized = protectedActions.length === 0 || ["AUTO_EXECUTE", "ORCHESTRATOR_APPROVAL", "OWNER_APPROVAL"].includes(params.approvalDecision ?? "");

  const checks: Record<HarnessEvalId, { passed: boolean; detail: string }> = {
    evidence_present: {
      passed: evidence.length >= params.contract.minimumEvidence,
      detail: `${evidence.length}/${params.contract.minimumEvidence} evidence items supplied`,
    },
    supervisor_verified: {
      passed: Boolean(verifiedBy),
      detail: verifiedBy ? `verified by ${verifiedBy}` : "independent verifier is missing",
    },
    no_unresolved_blockers: {
      passed: blockers.length === 0,
      detail: blockers.length === 0 ? "no unresolved blockers reported" : `${blockers.length} unresolved blocker(s) reported`,
    },
    completion_summary_present: {
      passed: Boolean(summary),
      detail: summary ? "completion summary supplied" : "completion summary is missing",
    },
    protected_action_authorized: {
      passed: protectedAuthorized,
      detail: protectedAuthorized ? "protected capability policy satisfied" : `protected capabilities require authorization: ${protectedActions.join(", ")}`,
    },
  };

  const evals = params.contract.requiredEvals.map(id => ({ id, required: true, ...checks[id] }));
  return { passed: evals.every(item => item.passed), evals };
}

export function harnessPrompt(contract: ExecutionHarnessContract): string {
  return [
    "MISSION CONTROL EXECUTION CONTRACT (AGENTIC HARNESS v1.0)",
    "This contract is authoritative for this execution and expires when the execution ends.",
    `Allowed capabilities: ${contract.capabilityScope.allowed.join(", ")}`,
    `Protected capabilities: ${contract.capabilityScope.protected.length ? contract.capabilityScope.protected.join(", ") : "none identified"}`,
    `Completion evidence required: ${contract.minimumEvidence}`,
    `Required completion evals: ${contract.requiredEvals.join(", ")}`,
    "Do not treat provider/runtime success as task completion.",
    "Do not use a protected capability unless Mission Control has granted the required approval.",
    "Return factual evidence, blockers and a concise completion summary. Unsupported completion claims must be rejected by Mission Control.",
  ].join("\n");
}

export async function loadTaskHarnessPrompt(taskId: number): Promise<string> {
  const [request] = await db
    .select()
    .from(workRequestsTable)
    .where(eq(workRequestsTable.taskId, taskId))
    .orderBy(desc(workRequestsTable.updatedAt))
    .limit(1);
  if (!request) return "";
  const contract = contractFromRequirements(request.requirements);
  return contract ? harnessPrompt(contract) : "";
}

export function withExecutionHarnessRequirements(existing: unknown, contract: ExecutionHarnessContract): JsonRecord {
  return {
    ...record(existing),
    agenticHarness: {
      contract,
      installedAt: new Date().toISOString(),
      architecture: "deterministic-control-plane",
    },
  };
}

export async function recordHarnessEvaluation(params: {
  request: WorkRequest;
  result: JsonRecord;
  evals: HarnessEval[];
  passed: boolean;
}): Promise<void> {
  const requirements = record(params.request.requirements);
  const harness = record(requirements.agenticHarness);
  const replay = Array.isArray(harness.failureReplayLog) ? [...harness.failureReplayLog] : [];
  if (!params.passed) {
    replay.push({
      recordedAt: new Date().toISOString(),
      requestId: params.request.id,
      attempt: params.request.retryCount,
      evals: params.evals,
      result: params.result,
    });
  }
  await db.update(workRequestsTable).set({
    requirements: {
      ...requirements,
      agenticHarness: {
        ...harness,
        lastEvaluation: { evaluatedAt: new Date().toISOString(), passed: params.passed, evals: params.evals },
        failureReplayLog: replay.slice(-10),
      },
    },
  }).where(eq(workRequestsTable.id, params.request.id));
}
