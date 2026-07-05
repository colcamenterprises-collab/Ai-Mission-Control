import {
  createTaskWorktree,
  getWorktreeDiagnostics,
} from "../services/worktree-manager.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filteredArgs = args.filter((arg) => arg !== "--dry-run");
const repoId = filteredArgs[0] ?? "mission-control";
const taskId = filteredArgs[1] ?? "diagnostic";
const branchName = filteredArgs[2] ?? `codex/${taskId}-dry-run`;

const command = dryRun
  ? createTaskWorktree({
      repoId,
      taskId,
      branchName,
      dryRun: true,
      safetyFlag: false,
    })
  : getWorktreeDiagnostics(repoId, taskId);

command
  .then((diagnostics) => {
    process.stdout.write(`${JSON.stringify(diagnostics, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Worktree diagnostics failed"}\n`,
    );
    process.exitCode = 1;
  });
