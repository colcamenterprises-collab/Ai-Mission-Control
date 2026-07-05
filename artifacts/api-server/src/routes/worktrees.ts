import { Router, type IRouter } from "express";
import {
  calculateSafeWorktreePath,
  getWorktreeDiagnostics,
  inspectGitStatus,
  inspectGitWorktreeAvailability,
  listConfiguredWorktreeRepositories,
} from "../services/worktree-manager.js";

const router: IRouter = Router();

function getQueryString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

router.get("/worktrees/repositories", (_req, res): void => {
  res.json({
    repositories: listConfiguredWorktreeRepositories(),
  });
});

router.get("/worktrees/path-preview", (req, res): void => {
  const repoId = getQueryString(req.query.repoId) ?? "mission-control";
  const taskId = getQueryString(req.query.taskId);

  if (!taskId) {
    res.status(400).json({ error: "taskId query parameter is required" });
    return;
  }

  try {
    res.json(calculateSafeWorktreePath(repoId, taskId));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unable to preview worktree path",
    });
  }
});

router.get("/worktrees/diagnostics", async (req, res): Promise<void> => {
  const repoId = getQueryString(req.query.repoId) ?? "mission-control";
  const taskId = getQueryString(req.query.taskId) ?? "diagnostic";

  try {
    res.json(await getWorktreeDiagnostics(repoId, taskId));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unable to inspect worktree diagnostics",
    });
  }
});

router.get("/worktrees/repositories/:repoId/git", async (req, res): Promise<void> => {
  try {
    const [status, worktree] = await Promise.all([
      inspectGitStatus(req.params.repoId),
      inspectGitWorktreeAvailability(req.params.repoId),
    ]);
    res.json({ status, worktree });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unable to inspect repository",
    });
  }
});

export default router;
