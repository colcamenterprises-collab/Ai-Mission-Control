import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router, type IRouter } from "express";
import { createRateLimit } from "../lib/rate-limit.js";

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
    res.status(400).json({ error: "message is required" });
    return;
  }

  const startedAt = Date.now();
  const combinedPrompt = `${JAMES_CONTEXT}\n\n${message}`;

  try {
    const { stdout, stderr } = await execFileAsync(JAMES_BINARY, ["-z", combinedPrompt], {
      timeout: JAMES_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });

    res.json({
      stdout,
      stderr,
      exitCode: 0,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string | null;
      signal?: NodeJS.Signals | null;
      killed?: boolean;
    };
    const timedOut = execError.killed === true || execError.signal === "SIGTERM";

    res.status(timedOut ? 504 : 500).json({
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? execError.message,
      exitCode: typeof execError.code === "number" ? execError.code : null,
      durationMs: Date.now() - startedAt,
      timedOut,
      error: execError.message,
    });
  }
});

export default router;
