import crypto from "node:crypto";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { promisify } from "node:util";
import { Router, type IRouter } from "express";
import { createRateLimit } from "../lib/rate-limit.js";
import { logger } from "../lib/logger.js";

const execFileAsync = promisify(execFile);
const JAMES_BINARY = "/usr/local/bin/james-hermes";
const JAMES_TIMEOUT_MS = 180_000;
const JAMES_JOB_TIMEOUT_MS = 600_000;
const MAX_JAMES_JOBS = 50;
const JAMES_CONTEXT = `Read /opt/hermes/JAMES_WORKSPACE_MAP.md before acting.
Mission Control path is /opt/apps/ai-mission-control.
Never modify SBB production without explicit approval.`;

const router: IRouter = Router();
const jamesJobs = new Map<string, JamesJob>();
const jamesJobRuntime = new Map<string, JamesJobRuntime>();

type JamesJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled";

type JamesJobEvent = {
  timestamp: string;
  type: string;
  message: string;
};

type JamesJob = {
  id: string;
  status: JamesJobStatus;
  prompt: string;
  message: string;
  project: string | null;
  environment: string | null;
  workspacePath: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number | null;
  error: string | null;
  logs: JamesJobEvent[];
};

type JamesJobRuntime = {
  process: ChildProcessWithoutNullStreams | null;
  timeout: NodeJS.Timeout | null;
  cancelRequested: boolean;
};

type JamesStatus = {
  binaryPath: string;
  exists: boolean;
  versionWorks: boolean;
  status: "online" | "offline";
  version: string | null;
  error: string | null;
};

type JamesExecError = NodeJS.ErrnoException & {
  stdout?: string;
  stderr?: string;
  code?: number | string | null;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
};

function createJobEvent(type: string, message: string): JamesJobEvent {
  return { timestamp: new Date().toISOString(), type, message };
}

function addJobEvent(job: JamesJob, type: string, message: string): void {
  job.logs.push(createJobEvent(type, message));
}

function pruneJobs(): void {
  const jobEntries = [...jamesJobs.entries()].sort(([, a], [, b]) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  while (jobEntries.length > MAX_JAMES_JOBS) {
    const [jobId, job] = jobEntries.shift()!;
    if (job.status === "running" || job.status === "queued") continue;
    jamesJobs.delete(jobId);
    jamesJobRuntime.delete(jobId);
  }
}

function sanitizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function publicJob(job: JamesJob): JamesJob {
  return { ...job, logs: [...job.logs] };
}

function buildJamesPrompt(message: string): string {
  return `${JAMES_CONTEXT}\n\n${message}`;
}

function startJamesJob(job: JamesJob): void {
  const runtime = jamesJobRuntime.get(job.id);
  if (!runtime) return;

  void access(JAMES_BINARY, constants.X_OK)
    .then(() => {
      if (runtime.cancelRequested) {
        job.status = "cancelled";
        job.completedAt = new Date().toISOString();
        job.durationMs = 0;
        addJobEvent(
          job,
          "cancelled",
          "Job was cancelled before James started.",
        );
        jamesJobRuntime.delete(job.id);
        return;
      }

      job.status = "running";
      job.startedAt = new Date().toISOString();
      const startedAtMs = Date.now();
      addJobEvent(job, "started", "James background job started.");

      const child = spawn(JAMES_BINARY, ["-z", job.prompt], {
        windowsHide: true,
      });
      runtime.process = child;
      runtime.timeout = setTimeout(() => {
        if (job.status !== "running") return;
        job.status = "timed_out";
        job.error = `James background job timed out after ${JAMES_JOB_TIMEOUT_MS}ms`;
        addJobEvent(job, "timed_out", job.error);
        child.kill("SIGTERM");
      }, JAMES_JOB_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        job.stdout += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        job.stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        if (runtime.timeout) clearTimeout(runtime.timeout);
        job.status = runtime.cancelRequested ? "cancelled" : "failed";
        job.error = getErrorMessage(
          error,
          "James background job failed to start",
        );
        job.completedAt = new Date().toISOString();
        job.durationMs = Date.now() - startedAtMs;
        addJobEvent(job, job.status, job.error);
        jamesJobRuntime.delete(job.id);
      });

      child.on("close", (code, signal) => {
        if (runtime.timeout) clearTimeout(runtime.timeout);
        job.exitCode = typeof code === "number" ? code : null;
        job.completedAt = new Date().toISOString();
        job.durationMs = Date.now() - startedAtMs;

        if (runtime.cancelRequested) {
          job.status = "cancelled";
          job.error = signal
            ? `James background job cancelled with signal ${signal}`
            : "James background job cancelled";
        } else if (job.status === "timed_out") {
          job.error = job.error ?? "James background job timed out";
        } else if (code === 0) {
          job.status = "completed";
        } else {
          job.status = "failed";
          job.error =
            job.stderr.trim() ||
            job.stdout.trim() ||
            `James background job exited with code ${code ?? "unknown"}`;
        }

        addJobEvent(job, job.status, `James background job ${job.status}.`);
        jamesJobRuntime.delete(job.id);
      });
    })
    .catch((error) => {
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.durationMs = 0;
      job.error = getErrorMessage(
        error,
        "james-hermes binary is not executable",
      );
      addJobEvent(job, "failed", job.error);
      jamesJobRuntime.delete(job.id);
      logger.error(
        { err: error, stack: getErrorStack(error), jobId: job.id },
        "James background job failed before command launch",
      );
    });
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

router.get("/james/status", async (_req, res): Promise<void> => {
  const status: JamesStatus = {
    binaryPath: JAMES_BINARY,
    exists: false,
    versionWorks: false,
    status: "offline",
    version: null,
    error: null,
  };

  try {
    await access(JAMES_BINARY, constants.X_OK);
    status.exists = true;
  } catch (error) {
    status.error =
      error instanceof Error
        ? error.message
        : "james-hermes binary is not executable";
    res.json(status);
    return;
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      JAMES_BINARY,
      ["--version"],
      {
        timeout: 10_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
    status.versionWorks = true;
    status.status = "online";
    status.version = (stdout || stderr).trim() || null;
  } catch (error) {
    status.error =
      error instanceof Error ? error.message : "james-hermes --version failed";
  }

  res.json(status);
});

router.post(
  "/james/jobs",
  createRateLimit("james-jobs", 10, 60_000),
  (req, res): void => {
    const message =
      typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!message) {
      res.status(400).json({
        error: "message is required",
        details:
          "Request body must be JSON with a non-empty string message field.",
      });
      return;
    }

    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const job: JamesJob = {
      id: jobId,
      status: "queued",
      prompt: buildJamesPrompt(message),
      message,
      project: sanitizeOptionalString(req.body?.project),
      environment: sanitizeOptionalString(req.body?.environment),
      workspacePath: sanitizeOptionalString(req.body?.workspacePath),
      createdAt: now,
      startedAt: null,
      completedAt: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: null,
      error: null,
      logs: [
        createJobEvent(
          "queued",
          "James background job queued. In-memory jobs reset if the API server restarts.",
        ),
      ],
    };

    jamesJobs.set(jobId, job);
    jamesJobRuntime.set(jobId, {
      process: null,
      timeout: null,
      cancelRequested: false,
    });
    pruneJobs();
    startJamesJob(job);

    res.status(202).json({ jobId, status: job.status });
  },
);

router.get("/james/jobs", (_req, res): void => {
  const jobs = [...jamesJobs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_JAMES_JOBS)
    .map(publicJob);

  res.json({
    jobs,
    note: "In-memory MVP: James jobs reset if the API server restarts.",
  });
});

router.get("/james/jobs/:jobId", (req, res): void => {
  const job = jamesJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "James job not found" });
    return;
  }

  res.json(publicJob(job));
});

router.post("/james/jobs/:jobId/cancel", (req, res): void => {
  const job = jamesJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "James job not found" });
    return;
  }

  if (!["queued", "running"].includes(job.status)) {
    res.json({
      jobId: job.id,
      status: job.status,
      cancelled: false,
      message: "Job is already finished.",
    });
    return;
  }

  const runtime = jamesJobRuntime.get(job.id);
  if (!runtime) {
    res.status(409).json({
      jobId: job.id,
      status: job.status,
      cancelled: false,
      message: "Job process is no longer available to cancel.",
    });
    return;
  }

  runtime.cancelRequested = true;
  addJobEvent(job, "cancel_requested", "Cancellation requested.");

  if (!runtime.process) {
    job.status = "cancelled";
    job.completedAt = new Date().toISOString();
    job.durationMs = 0;
    addJobEvent(job, "cancelled", "Queued job cancelled before process start.");
    jamesJobRuntime.delete(job.id);
    res.json({ jobId: job.id, status: job.status, cancelled: true });
    return;
  }

  const killed = runtime.process.kill("SIGTERM");
  res.json({
    jobId: job.id,
    status: job.status,
    cancelled: killed,
    message: killed
      ? "Cancellation signal sent."
      : "Cancellation signal could not be sent; job may finish normally.",
  });
});

router.post(
  "/james/message",
  createRateLimit("james-message", 10, 60_000),
  async (req, res): Promise<void> => {
    const message =
      typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!message) {
      res.status(400).json({
        success: false,
        error: "message is required",
        details:
          "Request body must be JSON with a non-empty string message field.",
      });
      return;
    }

    const startedAt = Date.now();
    const combinedPrompt = buildJamesPrompt(message);

    try {
      await access(JAMES_BINARY, constants.X_OK);
    } catch (error) {
      logger.error(
        { err: error, stack: getErrorStack(error) },
        "James message endpoint failed before command launch",
      );
      res.status(503).json({
        success: false,
        error: "James command is not available",
        details: getErrorMessage(
          error,
          "james-hermes binary is not executable",
        ),
      });
      return;
    }

    try {
      const { stdout, stderr } = await execFileAsync(
        JAMES_BINARY,
        ["-z", combinedPrompt],
        {
          timeout: JAMES_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      const response = stdout.trim() || stderr.trim();

      res.json({
        success: true,
        response,
        stdout,
        stderr,
        exitCode: 0,
        durationMs: Date.now() - startedAt,
        timedOut: false,
      });
    } catch (error) {
      const execError = error as JamesExecError;
      const timedOut =
        execError.killed === true || execError.signal === "SIGTERM";
      const stderr = execError.stderr ?? "";
      const stdout = execError.stdout ?? "";
      const details =
        stderr.trim() ||
        stdout.trim() ||
        getErrorMessage(error, "james-hermes command failed");

      logger.error(
        {
          err: error,
          stack: getErrorStack(error),
          exitCode: execError.code ?? null,
          signal: execError.signal ?? null,
          timedOut,
          durationMs: Date.now() - startedAt,
          stderr,
        },
        "James message endpoint command execution failed",
      );

      res.status(timedOut ? 504 : 502).json({
        success: false,
        error: timedOut ? "James command timed out" : "James command failed",
        details,
        stdout,
        stderr,
        exitCode: typeof execError.code === "number" ? execError.code : null,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    }
  },
);

export default router;
