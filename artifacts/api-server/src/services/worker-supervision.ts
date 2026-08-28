import crypto from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { asc, eq } from "drizzle-orm";
import { db, tasksTable, taskMessagesTable } from "@workspace/db";

const execFileAsync = promisify(execFile);
const STATE_DIR = "/var/lib/ai-mission-control/james-review-jobs";
const REVIEW_RUNNER = "/opt/apps/ai-mission-control/scripts/run-james-completion-review.sh";

export type TaskIntent = "acknowledgement_test" | "information_request" | "analysis" | "execution" | "reconciliation" | "investigation" | "creation" | "approval_gated_action";
export type TaskComplexity = "trivial" | "standard" | "material" | "high_risk";

function activeReviewFile(taskId: number): string { return `${STATE_DIR}/task-${taskId}.active`; }

export async function isActiveJamesReviewJob(taskId: number, jobId: string): Promise<boolean> {
  if (!jobId) return false;
  try { return (await readFile(activeReviewFile(taskId), "utf8")).trim() === jobId; }
  catch { return false; }
}

export async function clearActiveJamesReviewJob(taskId: number, jobId: string): Promise<void> {
  if (!(await isActiveJamesReviewJob(taskId, jobId))) return;
  try { await unlink(activeReviewFile(taskId)); } catch {}
}

export function classifyTaskIntent(title: string, description: string): { intent: TaskIntent; complexity: TaskComplexity } {
  const text = `${title} ${description}`.toLowerCase();
  if (/nothing required|no action required|just checking|checking you are allocated|acknowledge|test allocation|test dispatch/.test(text)) return { intent: "acknowledgement_test", complexity: "trivial" };
  if (/reconcil|bank statement|grab statement|ledger|p&l|profit and loss|expense|financial|balance|cash/.test(text)) return { intent: "reconciliation", complexity: "material" };
  if (/approve|approval|production|deploy|delete|payment|publish|protected/.test(text)) return { intent: "approval_gated_action", complexity: "high_risk" };
  if (/investigat|root cause|audit|verify|validate|review/.test(text)) return { intent: "investigation", complexity: "material" };
  if (/build|create|write|draft|design|implement/.test(text)) return { intent: "creation", complexity: "standard" };
  if (/analyse|analyze|compare|assess|evaluate/.test(text)) return { intent: "analysis", complexity: "standard" };
  if (/run|execute|update|change|fix|patch|send|move/.test(text)) return { intent: "execution", complexity: "standard" };
  return { intent: "information_request", complexity: "standard" };
}

export function humanReadableWorkerOutput(output: string | null | undefined): string | null {
  if (!output?.trim()) return null;
  const trimmed = output.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const candidates = [parsed.finalAssistantVisibleText, parsed.final, parsed.response, parsed.message, parsed.output];
    for (const candidate of candidates) if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  } catch {}
  const reportIndex = trimmed.search(/(?:^|\n)(?:#{0,3}\s*)?(?:Task Report|Report|Summary)\b/i);
  if (reportIndex > 200) return trimmed.slice(reportIndex).trim().slice(0, 8000);
  if (/"systemPrompt"|"toolsSchema"|"runId"|"tokenUsage"|"systemPromptReport"/i.test(trimmed)) {
    const visible = trimmed.match(/"finalAssistantVisibleText"\s*:\s*"((?:\\.|[^"\\])*)"/s)?.[1];
    if (visible) {
      try { return JSON.parse(`"${visible}"`); } catch {}
    }
    return "Worker execution completed. Detailed runtime telemetry was retained in the execution audit and withheld from the owner conversation.";
  }
  return trimmed.slice(0, 8000);
}

export async function queueJamesCompletionReview(taskId: number, workerName: string, workerOutput: string | null | undefined): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) return { queued: false, reason: "task not found" };

  const history = await db.select().from(taskMessagesTable).where(eq(taskMessagesTable.taskId, taskId)).orderBy(asc(taskMessagesTable.createdAt));
  const compactHistory = history.slice(-12).map(item => `${item.author}: ${item.body.slice(0, 1800)}`).join("\n\n");
  const classification = classifyTaskIntent(task.title, task.description ?? "");
  const prompt = [
    `MISSION CONTROL SUPERVISORY REVIEW — Task #${task.id}: ${task.title}`,
    `Project: ${task.project}`,
    `Assigned specialist worker: ${workerName}`,
    `Task intent: ${classification.intent}`,
    `Task complexity: ${classification.complexity}`,
    "",
    "AUTHORITATIVE OWNER BRIEF:",
    task.description ?? "",
    "",
    "SPECIALIST WORKER RESULT:",
    humanReadableWorkerOutput(workerOutput) ?? "No owner-visible worker narrative was returned.",
    "",
    "RECENT TASK CONVERSATION:",
    compactHistory || "No prior task history.",
    "",
    "JAMES SUPERVISORY QA CONTRACT:",
    "Perform a fresh verification pass even when James Hermes was also the executing worker. Treat the execution result as unverified input.",
    "Independently judge whether the worker actually satisfied the owner's brief. Runtime/provider success is not task completion.",
    "Check task intent, requirements, evidence, accuracy, completeness, proportionality, playbook/policy compliance, unsupported claims and blockers.",
    "For a trivial acknowledgement/no-action test, a concise acknowledgement is sufficient and doing extra work is a quality failure.",
    "Do not accept claims that are not supported by the task evidence.",
    "Return VERIFIED_COMPLETE only when the work is satisfactory. Otherwise return REWORK_REQUIRED with precise corrective instructions.",
    "Escalate owner review only when owner judgement/approval is genuinely required or the task was explicitly marked owner-review-required.",
  ].join("\n");

  const jobId = crypto.randomUUID().replace(/[^a-zA-Z0-9-]/g, "");
  await mkdir(STATE_DIR, { recursive: true });
  const promptFile = `${STATE_DIR}/${jobId}.prompt`;
  await writeFile(promptFile, prompt, { encoding: "utf8", mode: 0o600 });
  await writeFile(activeReviewFile(taskId), `${jobId}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    await execFileAsync("systemd-run", [
      `--unit=james-review-${jobId}`, "--collect", "--no-block", "/bin/bash", REVIEW_RUNNER,
      jobId, String(taskId), workerName, promptFile,
    ], { timeout: 15_000, windowsHide: true });
    await db.insert(taskMessagesTable).values({ taskId, author: "James Hermes", body: "Supervisory review started. I am checking the worker result against the original owner brief and evidence." });
    return { queued: true, jobId };
  } catch (error) {
    await clearActiveJamesReviewJob(taskId, jobId);
    const reason = error instanceof Error ? error.message : "unknown James review launch error";
    await db.insert(taskMessagesTable).values({ taskId, author: "Mission Control", body: `BLOCKED — James supervisory review could not be launched: ${reason}` });
    await db.update(tasksTable).set({ status: "blocked" }).where(eq(tasksTable.id, taskId));
    return { queued: false, reason };
  }
}
