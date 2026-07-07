#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

try {
  const { stdout, stderr } = await execFileAsync(
    "pnpm",
    [
      "--filter",
      "@workspace/scripts",
      "exec",
      "tsx",
      "-e",
      "import('../artifacts/api-server/src/services/skills.ts').then(async ({ syncSkills }) => { const result = await syncSkills(); console.log(JSON.stringify({ origins: result.origins, skillCount: result.skills.length }, null, 2)); })",
    ],
    { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, maxBuffer: 10_000_000 },
  );
  if (stdout.trim()) process.stdout.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);
} catch (error) {
  const err = error;
  if (err.stdout) process.stdout.write(err.stdout);
  if (err.stderr) process.stderr.write(err.stderr);
  console.error(`skills sync failed: ${err.message ?? "unknown error"}`);
  process.exitCode = typeof err.code === "number" ? err.code : 1;
}
