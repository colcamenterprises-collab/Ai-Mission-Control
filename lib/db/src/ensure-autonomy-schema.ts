import { sql } from "drizzle-orm";

type SqlExecutor = {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
};

export async function ensureAutonomySchema(database: SqlExecutor): Promise<void> {
  await database.execute(sql`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS next_action text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS next_action_owner text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocker text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_decision_reason text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_orchestrator_review_at timestamptz;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS supervision_attempts integer NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS tasks_supervision_idx ON tasks(status, last_orchestrator_review_at) WHERE archived_at IS NULL;
  `);
}
