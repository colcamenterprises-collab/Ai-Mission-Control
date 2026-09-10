#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import process from "node:process";

function usage() {
  console.error("Usage: node scripts/prepare-production-delivery.mjs --repo owner/name --pr NUMBER [--task-id NUMBER] [--max-repairs 0-3]");
  process.exit(64);
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const repository = arg("--repo");
const pullRequest = Number(arg("--pr"));
const taskIdRaw = arg("--task-id");
const maxRepairAttempts = Number(arg("--max-repairs") ?? "2");
const API_BASE = (process.env.MISSION_CONTROL_API_BASE || "http://127.0.0.1:4100/api").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.MISSION_CONTROL_ADMIN_TOKEN || process.env.VITE_MISSION_CONTROL_ADMIN_TOKEN || "";

if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) usage();
if (!Number.isInteger(pullRequest) || pullRequest <= 0) usage();
if (!Number.isInteger(maxRepairAttempts) || maxRepairAttempts < 0 || maxRepairAttempts > 3) usage();
if (!ADMIN_TOKEN) throw new Error("MISSION_CONTROL_ADMIN_TOKEN is required");

function ghJson(args) {
  const stdout = execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(stdout);
}

const pr = ghJson(["api", `repos/${repository}/pulls/${pullRequest}`]);
if (pr.state !== "open" || pr.merged) throw new Error(`PR #${pullRequest} must be open and unmerged`);
if (pr.draft) throw new Error(`PR #${pullRequest} is still a draft`);
if (pr.base?.ref !== "main") throw new Error(`PR #${pullRequest} must target main`);
if (pr.head?.repo?.full_name !== repository) throw new Error("Fork-based PRs cannot be prepared for autonomous production delivery");
if (!/^[0-9a-f]{40}$/i.test(pr.head?.sha || "")) throw new Error("GitHub did not provide an exact PR head SHA");

const checks = ghJson(["api", `repos/${repository}/commits/${pr.head.sha}/check-runs?per_page=100`]);
const validateChecks = (checks.check_runs || []).filter((run) => run.name === "validate" || String(run.name || "").includes("validate"));
if (!validateChecks.length) throw new Error("Required Mission Control CI 'validate' check was not found");
if (!validateChecks.every((run) => run.status === "completed" && ["success", "neutral", "skipped"].includes(run.conclusion))) {
  throw new Error(`PR #${pullRequest} is not ready: required CI has not passed`);
}

const body = {
  repository,
  pullRequest,
  approvedHeadSha: String(pr.head.sha).toLowerCase(),
  maxRepairAttempts,
  project: "Mission Control",
  business: "Customli",
};
if (taskIdRaw !== undefined) {
  const taskId = Number(taskIdRaw);
  if (!Number.isInteger(taskId) || taskId <= 0) throw new Error("--task-id must be a positive integer");
  body.taskId = taskId;
}

const response = await fetch(`${API_BASE}/continuous-delivery/prepare`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  body: JSON.stringify(body),
});
const text = await response.text();
let result;
try { result = JSON.parse(text); } catch { result = { raw: text }; }
if (!response.ok) throw new Error(`Mission Control ${response.status}: ${result?.error || response.statusText}`);

console.log(JSON.stringify({
  prepared: true,
  duplicate: result.duplicate === true,
  executionId: result.request?.id,
  executionKey: result.request?.executionKey,
  state: result.request?.state,
  approvalId: result.approval?.id ?? null,
  repository,
  pullRequest,
  approvedHeadSha: body.approvedHeadSha,
  maxRepairAttempts,
}, null, 2));
