import app from "./app";
import { ensureOperationalSchema } from "@workspace/db";
import { logger } from "./lib/logger";
import { syncMemorySources } from "./services/memory-sync.js";
import { initializeAgentSkillAssignments } from "./config-operational-agents.js";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});