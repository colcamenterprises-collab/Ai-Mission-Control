#!/usr/bin/env node
import { execFile, execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const API_BASE = (process.env.MISSION_CONTROL_API_BASE || "http://127.0.0.1:4100/api").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.MISSION_CONTROL_ADMIN_TOKEN || process.env.VITE_MISSION_CONTROL_ADMIN_TOKEN || "";
const APP_ROOT = process.env.MISSION_CONTROL_REPO_DIR || "/opt/apps/ai-mission-control";
const DATA_ROOT = process.env.MISSION_CONTROL_DELIVERY_DATA_DIR || "/var/lib/ai-mission-control/continuous-delivery";
const POLL_MS = Math.max(15_000, Number(process.env.MISSION_CONTROL_DELIVERY_POLL_MS || 30_000));
const CODEX_REMEDIATION = process.env.MISSION_CONTROL_CODEX_REMEDIATION_ENABLED !== "0";
const MAX_LOG_CHARS = 24_000;
const REQUIRED_CHECK = process.env.MISSION_CONTROL_REQUIRED_GITHUB_CHECK || "validate";
const ALLOWED_REPAIR_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);
const PROTECTED_REPAIR_PATHS = [
  /^\.github\//,
  /^\.env(?:\.|$)/,
  /(^|\/)migrations?\//i,
  /^lib\/db\/src\/schema\//,
  /^scripts\/continuous-delivery-/,
  /^scripts\/deploy-mission-control\.sh$/,
  /nginx/i,
  /systemd/i,
  /credential/i,
  /secret/i,
];

function log(message, extra) {
  const prefix = `[${new Date().toISOString()}] continuous-delivery`;
  if (extra === undefined) console.log(prefix, message);
  else console.log(prefix, message, extra);
}

function clip(value) {
  const text = String(value ?? "");
  return text.length <= MAX_LOG_CHARS ? text : text.slice(-MAX_LOG_CHARS);
}

async function api(pathname, init = {}) {
  if (!ADMIN_TOKEN) throw new Error("MISSION_CONTROL_ADMIN_TOKEN is required by the delivery controller");
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ADMIN_TOKEN}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: clip(text) }; }
  }
  if (!response.ok) {
    const detail = body?.error || body?.message || response.statusText;
    throw Object.assign(new Error(`Mission Control API ${response.status}: ${detail}`), { status: response.status, body });
  }
  return body;
}

function githubToken() {
  const env = process.env.MISSION_CONTROL_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (env) return env.trim();
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    throw new Error("GitHub authentication missing: set MISSION_CONTROL_GITHUB_TOKEN or authenticate gh CLI");
  }
}

async function github(repository, pathname, init = {}) {
  const token = githubToken();
  const response = await fetch(`https://api.github.com/repos/${repository}${pathname}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "mission-control-continuous-delivery",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: clip(text) }; }
  }
  if (!response.ok) {
    throw Object.assign(new Error(`GitHub ${response.status}: ${body?.message || response.statusText}`), { status: response.status, body });
  }
  return body;
}

async function verifyPrAndChecks(envelope) {
  const pr = await github(envelope.repository, `/pulls/${envelope.pullRequest}`);
  if (pr.state !== "open" || pr.merged) throw new Error(`PR #${envelope.pullRequest} is not open and mergeable`);
  if (String(pr.head?.sha || "").toLowerCase() !== envelope.approvedHeadSha) {
    throw new Error(`PR head changed after approval: approved ${envelope.approvedHeadSha}, current ${pr.head?.sha || "missing"}`);
  }
  if (pr.head?.repo?.full_name !== envelope.repository) {
    throw new Error("Production delivery refuses fork-based PRs");
  }
  if (pr.base?.ref !== envelope.baseBranch) throw new Error(`PR base must be ${envelope.baseBranch}`);
  if (pr.draft) throw new Error("PR is still draft");
  if (pr.mergeable === false) throw new Error("PR is not mergeable");

  const checks = await github(envelope.repository, `/commits/${envelope.approvedHeadSha}/check-runs?per_page=100`);
  const runs = Array.isArray(checks.check_runs) ? checks.check_runs : [];
  const required = runs.filter((run) => run.name === REQUIRED_CHECK || String(run.name || "").includes(REQUIRED_CHECK));
  if (!required.length) throw new Error(`Required GitHub check '${REQUIRED_CHECK}' was not found`);
  for (const check of required) {
    if (check.status !== "completed" || !ALLOWED_REPAIR_CONCLUSIONS.has(check.conclusion)) {
      throw new Error(`Required GitHub check '${check.name}' is ${check.status}/${check.conclusion || "pending"}`);
    }
  }

  const status = await github(envelope.repository, `/commits/${envelope.approvedHeadSha}/status`);
  if (Number(status.total_count || 0) > 0 && status.state !== "success") {
    throw new Error(`Combined GitHub commit status is ${status.state}`);
  }
  return pr;
}

async function mergePr(envelope) {
  await verifyPrAndChecks(envelope);
  const merged = await github(envelope.repository, `/pulls/${envelope.pullRequest}/merge`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sha: envelope.approvedHeadSha,
      merge_method: "merge",
      commit_title: `Approved production delivery PR #${envelope.pullRequest}`,
    }),
  });
  if (!merged.merged || !/^[0-9a-f]{40}$/i.test(merged.sha || "")) {
    throw new Error(`GitHub did not return a verified merge SHA: ${merged.message || "merge failed"}`);
  }
  return String(merged.sha).toLowerCase();
}

async function runDeploy(targetSha) {
  try {
    const { stdout, stderr } = await execFileAsync("bash", [path.join(APP_ROOT, "scripts/continuous-delivery-deploy.sh"), targetSha], {
      cwd: APP_ROOT,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 20 * 60 * 1000,
    });
    return { ok: true, stdout: clip(stdout), stderr: clip(stderr), targetSha };
  } catch (error) {
    return {
      ok: false,
      stdout: clip(error.stdout),
      stderr: clip(error.stderr),
      targetSha,
      code: error.code ?? null,
      signal: error.signal ?? null,
      message: error.message,
      rollbackSucceeded: /ROLLBACK_SUCCEEDED=([0-9a-f]{40})/i.test(String(error.stderr || "")),
      rollbackFailed: /ROLLBACK_FAILED=([0-9a-f]{40})/i.test(String(error.stderr || "")),
    };
  }
}

function protectedRepairPath(file) {
  return PROTECTED_REPAIR_PATHS.some((pattern) => pattern.test(file));
}

async function run(command, args, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd || APP_ROOT,
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 16 * 1024 * 1024,
    timeout: options.timeout || 10 * 60 * 1000,
  });
  return { stdout: clip(stdout), stderr: clip(stderr) };
}

async function waitForGreenChecks(repository, sha, timeoutMs = 12 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const checks = await github(repository, `/commits/${sha}/check-runs?per_page=100`);
    const runs = Array.isArray(checks.check_runs) ? checks.check_runs : [];
    const required = runs.filter((item) => item.name === REQUIRED_CHECK || String(item.name || "").includes(REQUIRED_CHECK));
    if (required.length && required.every((item) => item.status === "completed" && ALLOWED_REPAIR_CONCLUSIONS.has(item.conclusion))) return;
    if (required.some((item) => item.status === "completed" && !ALLOWED_REPAIR_CONCLUSIONS.has(item.conclusion))) {
      throw new Error(`Repair PR required check failed: ${required.map((item) => `${item.name}:${item.conclusion}`).join(", ")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error("Timed out waiting for repair PR CI");
}

async function remediate(execution, envelope, failure, attempt) {
  if (!CODEX_REMEDIATION) throw new Error("Codex remediation is disabled");
  const safeKey = String(execution.executionKey).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 64);
  const branch = `repair/cd-${execution.id}-${attempt}`;
  const worktree = path.join(DATA_ROOT, "worktrees", `${safeKey}-${attempt}`);
  await mkdir(path.dirname(worktree), { recursive: true });
  await rm(worktree, { recursive: true, force: true });

  await run("git", ["fetch", "origin", "main"], { cwd: APP_ROOT });
  await run("git", ["worktree", "add", "-B", branch, worktree, "origin/main"], { cwd: APP_ROOT });
  try {
    const prompt = [
      "You are repairing a failed production deployment for Mission Control.",
      `Execution: ${execution.executionKey}`,
      `Repository: ${envelope.repository}`,
      `Failed deployed SHA: ${failure.targetSha}`,
      `Repair attempt: ${attempt}/${envelope.maxRepairAttempts}`,
      "The previous production version has already been restored. Work only in this isolated worktree.",
      "Do not touch production, credentials, secrets, DNS, firewall, nginx, systemd, GitHub workflows, deployment-control scripts, database schema/migrations, or any other repository.",
      "Make only the smallest code change directly required to correct this deployment failure. Run relevant local tests. Do not push, merge or deploy; the controller handles those steps after deterministic validation.",
      "Failure evidence follows:",
      clip(`${failure.message || ""}\nSTDOUT:\n${failure.stdout || ""}\nSTDERR:\n${failure.stderr || ""}`),
    ].join("\n\n");

    await run("codex", ["--ask-for-approval", "never", "--sandbox", "workspace-write", "--cd", worktree, "exec", prompt], {
      cwd: worktree,
      timeout: 20 * 60 * 1000,
      env: { CODEX_HOME: process.env.CODEX_HOME || path.join(process.env.HOME || "/root", ".codex") },
    });

    const diff = await run("git", ["diff", "--name-only", "origin/main"], { cwd: worktree });
    const files = diff.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!files.length) throw new Error("Codex remediation produced no file changes");
    const protectedFiles = files.filter(protectedRepairPath);
    if (protectedFiles.length) {
      throw new Error(`Repair crossed protected boundary and requires new owner approval: ${protectedFiles.join(", ")}`);
    }

    await run("pnpm", ["install", "--frozen-lockfile", "--offline"], { cwd: worktree, timeout: 10 * 60 * 1000 });
    await run("pnpm", ["typecheck:production"], { cwd: worktree, timeout: 10 * 60 * 1000 });
    await run("pnpm", ["test:execution"], { cwd: worktree, timeout: 10 * 60 * 1000 });
    await run("pnpm", ["build"], { cwd: worktree, timeout: 15 * 60 * 1000 });
    await run("git", ["diff", "--check"], { cwd: worktree });

    await run("git", ["add", "--", ...files], { cwd: worktree });
    await run("git", ["commit", "-m", `Repair production delivery ${execution.executionKey} attempt ${attempt}`], { cwd: worktree });
    const repairHead = (await run("git", ["rev-parse", "HEAD"], { cwd: worktree })).stdout.trim().toLowerCase();
    await run("git", ["push", "--force-with-lease", "origin", `HEAD:${branch}`], { cwd: worktree, timeout: 5 * 60 * 1000 });

    const pr = await github(envelope.repository, "/pulls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `Repair production delivery ${execution.executionKey} (attempt ${attempt})`,
        head: branch,
        base: "main",
        body: `Automated bounded remediation for owner-approved execution ${execution.executionKey}.\n\nProtected infrastructure, secrets and database paths are excluded by controller policy. Production was rolled back before this repair was attempted.`,
      }),
    });
    await waitForGreenChecks(envelope.repository, repairHead);
    const merged = await github(envelope.repository, `/pulls/${pr.number}/merge`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sha: repairHead, merge_method: "merge", commit_title: `Bounded repair for ${execution.executionKey}` }),
    });
    if (!merged.merged || !/^[0-9a-f]{40}$/i.test(merged.sha || "")) throw new Error(`Repair PR merge failed: ${merged.message || "unknown"}`);
    return { repairPr: pr.number, repairHead, mergedSha: String(merged.sha).toLowerCase(), files };
  } finally {
    try { await run("git", ["worktree", "remove", "--force", worktree], { cwd: APP_ROOT }); } catch {}
  }
}

async function report(executionId, outcome, summary, result, error) {
  try {
    await api(`/continuous-delivery/report/${executionId}`, {
      method: "POST",
      body: JSON.stringify({ outcome, summary, result, error }),
    });
  } catch (reportError) {
    log(`CRITICAL: could not report final state for execution ${executionId}`, reportError.message);
    throw reportError;
  }
}

async function processExecution(row) {
  let claim;
  try {
    claim = await api(`/continuous-delivery/claim/${row.id}`, { method: "POST", body: "{}" });
  } catch (error) {
    if (error.status === 409) return;
    throw error;
  }
  const { execution, envelope } = claim;
  const evidence = { repository: envelope.repository, pullRequest: envelope.pullRequest, approvedHeadSha: envelope.approvedHeadSha, attempts: [] };

  try {
    log(`execution ${execution.id}: validating and merging PR #${envelope.pullRequest}`);
    let targetSha = await mergePr(envelope);
    evidence.initialMergeSha = targetSha;

    let deployment = await runDeploy(targetSha);
    evidence.attempts.push({ type: "deploy", targetSha, ok: deployment.ok, rollbackSucceeded: deployment.rollbackSucceeded || false });
    if (deployment.ok) {
      await report(execution.id, "success", `PR #${envelope.pullRequest} merged and production certified at ${targetSha}`, { ...evidence, deployedSha: targetSha, certified: true });
      return;
    }
    if (deployment.rollbackFailed) throw new Error(`Deployment failed and automatic rollback also failed. ${deployment.message}`);

    for (let attempt = 1; attempt <= envelope.maxRepairAttempts; attempt += 1) {
      const repair = await remediate(execution, envelope, deployment, attempt);
      evidence.attempts.push({ type: "repair", attempt, repairPr: repair.repairPr, files: repair.files, mergedSha: repair.mergedSha });
      targetSha = repair.mergedSha;
      deployment = await runDeploy(targetSha);
      evidence.attempts.push({ type: "deploy", targetSha, ok: deployment.ok, rollbackSucceeded: deployment.rollbackSucceeded || false });
      if (deployment.ok) {
        await report(execution.id, "success", `Production certified at ${targetSha} after bounded repair attempt ${attempt}`, { ...evidence, deployedSha: targetSha, certified: true, repairAttempts: attempt });
        return;
      }
      if (deployment.rollbackFailed) throw new Error(`Repair deployment failed and automatic rollback also failed. ${deployment.message}`);
    }
    throw new Error(`Deployment failed after ${envelope.maxRepairAttempts} approved repair attempt(s); production rollback remained active`);
  } catch (error) {
    await report(execution.id, "failure", `Production delivery did not certify: ${error.message}`, { ...evidence, certified: false }, clip(error.stack || error.message));
  }
}

async function cycle() {
  const response = await api("/executions?state=approved");
  const rows = Array.isArray(response.data) ? response.data : [];
  for (const row of rows) {
    const cd = row?.requirements?.continuousDelivery;
    if (cd?.kind !== "production_delivery" || cd?.environment !== "production") continue;
    try { await processExecution(row); }
    catch (error) { log(`execution ${row.id}: controller error`, error.message); }
  }
}

async function main() {
  await mkdir(DATA_ROOT, { recursive: true });
  if (!ADMIN_TOKEN) throw new Error("MISSION_CONTROL_ADMIN_TOKEN or VITE_MISSION_CONTROL_ADMIN_TOKEN must be available to the controller");
  githubToken();
  log(`started; API=${API_BASE}; poll=${POLL_MS}ms; codexRemediation=${CODEX_REMEDIATION}`);
  do {
    try { await cycle(); } catch (error) { log("poll cycle failed", error.message); }
    if (process.argv.includes("--once")) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  } while (true);
}

main().catch((error) => {
  console.error("continuous-delivery controller fatal:", error.message);
  process.exit(1);
});
