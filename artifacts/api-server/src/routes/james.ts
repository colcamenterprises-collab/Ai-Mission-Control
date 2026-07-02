import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router, type IRouter } from "express";
import { createRateLimit } from "../lib/rate-limit.js";
import { logger } from "../lib/logger.js";

const execFileAsync = promisify(execFile);
const JAMES_BINARY = "/usr/local/bin/james-hermes";
const JAMES_TIMEOUT_MS = 180_000;
const JAMES_CONTEXT = `Read /opt/hermes/JAMES_WORKSPACE_MAP.md before acting.
Mission Control path is /opt/apps/ai-mission-control.
Never modify SBB production without explicit approval.`;

const router: IRouter = Router();

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
    status.error = error instanceof Error ? error.message : "james-hermes binary is not executable";
    res.json(status);
    return;
  }

  try {
    const { stdout, stderr } = await execFileAsync(JAMES_BINARY, ["--version"], {
      timeout: 10_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    status.versionWorks = true;
    status.status = "online";
    status.version = (stdout || stderr).trim() || null;
  } catch (error) {
    status.error = error instanceof Error ? error.message : "james-hermes --version failed";
  }

  res.json(status);
});

router.post("/james/message", createRateLimit("james-message", 10, 60_000), async (req, res): Promise<void> => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

  if (!message) {
    res.status(400).json({
      success: false,
      error: "message is required",
      details: "Request body must be JSON with a non-empty string message field.",
    });
    return;
  }

  const startedAt = Date.now();
  const combinedPrompt = `${JAMES_CONTEXT}\n\n${message}`;

  try {
    await access(JAMES_BINARY, constants.X_OK);
  } catch (error) {
    logger.error({ err: error, stack: getErrorStack(error) }, "James message endpoint failed before command launch");
    res.status(503).json({
      success: false,
      error: "James command is not available",
      details: getErrorMessage(error, "james-hermes binary is not executable"),
    });
    return;
  }

  try {
    const { stdout, stderr } = await execFileAsync(JAMES_BINARY, ["-z", combinedPrompt], {
      timeout: JAMES_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
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
    const timedOut = execError.killed === true || execError.signal === "SIGTERM";
    const stderr = execError.stderr ?? "";
    const stdout = execError.stdout ?? "";
    const details = stderr.trim() || stdout.trim() || getErrorMessage(error, "james-hermes command failed");

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
});

export default router;
