import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ensureSource = await readFile(new URL("../lib/db/src/ensure-operational-schema.ts", import.meta.url), "utf8");
const deploySource = await readFile(new URL("../scripts/deploy-mission-control.sh", import.meta.url), "utf8");

const requiredColumns = {
  memories: ["content", "category", "preview", "created_at", "updated_at"],
  agents: [
    "department",
    "is_lead",
    "status",
    "current_task",
    "last_active",
    "responsibilities",
    "avatar_initials",
    "tasks_completed",
    "success_rate",
    "created_at",
    "is_plugged_in",
    "provider",
    "model",
    "api_key",
    "endpoint",
    "inbound_token",
    "last_ping",
  ],
  contacts: ["handle", "timezone", "category", "compensation", "notes", "created_at"],
};

for (const [table, columns] of Object.entries(requiredColumns)) {
  assert.match(ensureSource, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
  for (const column of columns) {
    assert.match(
      ensureSource,
      new RegExp(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column}\\b`),
      `${table}.${column} must be added idempotently`,
    );
  }
}

assert.match(deploySource, /run_pnpm run db:ensure-operational-schema/);
assert.ok(
  deploySource.indexOf("run_pnpm run db:ensure-operational-schema") < deploySource.lastIndexOf("run_smoke_if_available"),
  "deploy must ensure schema before smoke",
);

console.log("Operational schema contract checks passed.");
