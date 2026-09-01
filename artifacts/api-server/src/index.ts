import app from "./app";
import { ensureOperationalSchema } from "@workspace/db";
import { logger } from "./lib/logger";
import { syncMemorySources } from "./services/memory-sync.js";
import { initializeAgentSkillAssignments } from "./config-operational-agents.js";
import { superviseActiveTasks } from "./services/task-supervisor.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await ensureOperationalSchema();
const skillAssignments = await initializeAgentSkillAssignments();
logger.info({ skillAssignments }, "Durable agent skill assignments initialized");

try {
  const memorySync = await syncMemorySources({ force: true });
  logger.info({ memorySync }, "Durable memory sources synchronized");
} catch (err) {
  logger.error({ err }, "Durable memory source synchronization failed");
}

async function runTaskSupervision(): Promise<void> {
  try {
    const supervision = await superviseActiveTasks();
    if (supervision.delegated || supervision.ownerEscalations || supervision.runtimeFailures) {
      logger.info({ supervision }, "Continuous task supervision cycle completed");
    }
  } catch (err) {
    logger.error({ err }, "Continuous task supervision cycle failed");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const firstRunMs = Number(process.env.MISSION_CONTROL_SUPERVISION_FIRST_RUN_MS ?? 30_000);
  const intervalMs = Number(process.env.MISSION_CONTROL_SUPERVISION_INTERVAL_MS ?? 300_000);
  setTimeout(() => void runTaskSupervision(), Number.isFinite(firstRunMs) && firstRunMs >= 0 ? firstRunMs : 30_000).unref();
  setInterval(() => void runTaskSupervision(), Number.isFinite(intervalMs) && intervalMs >= 60_000 ? intervalMs : 300_000).unref();
});