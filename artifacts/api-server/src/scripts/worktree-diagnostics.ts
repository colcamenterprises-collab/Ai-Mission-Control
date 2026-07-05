import { getWorktreeDiagnostics } from "../services/worktree-manager.js";

const repoId = process.argv[2] ?? "mission-control";
const taskId = process.argv[3] ?? "diagnostic";

getWorktreeDiagnostics(repoId, taskId)
  .then((diagnostics) => {
    process.stdout.write(`${JSON.stringify(diagnostics, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Worktree diagnostics failed"}\n`,
    );
    process.exitCode = 1;
  });
