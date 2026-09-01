import { sql } from "drizzle-orm";

type SqlExecutor = { execute(query: ReturnType<typeof sql>): Promise<unknown> };

export async function ensureModelPolicySchema(database: SqlExecutor): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_model_policies (
      agent_id integer PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
      policy_class text NOT NULL DEFAULT 'balanced',
      provider text NOT NULL DEFAULT 'openrouter',
      primary_model text NOT NULL,
      fallback_model text,
      max_cost_class text NOT NULL DEFAULT 'standard',
      allow_escalation boolean NOT NULL DEFAULT true,
      escalation_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS model_usage_events (
      id bigserial PRIMARY KEY,
      agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
      task_id integer REFERENCES tasks(id) ON DELETE SET NULL,
      provider text NOT NULL,
      model text NOT NULL,
      policy_class text,
      input_tokens integer,
      output_tokens integer,
      total_tokens integer,
      cost_usd numeric(14,8),
      success boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS model_usage_events_agent_created_idx ON model_usage_events(agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS model_usage_events_task_created_idx ON model_usage_events(task_id, created_at DESC);
  `);
}
