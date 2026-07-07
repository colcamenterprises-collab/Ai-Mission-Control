import { sql } from "drizzle-orm";

type SqlExecutor = {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
};

/**
 * Ensures the operational Mission Control tables match the Drizzle models used
 * by the API routes. This is intentionally additive and idempotent: it creates
 * missing tables/columns only, and never drops, renames, or rewrites canonical
 * data. Existing rows that predate required response fields are backfilled with
 * explicit deterministic sentinel values so list routes can serialize them
 * without masking the fact that historical source data was incomplete.
 */
export async function ensureOperationalSchema(database: SqlExecutor): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id serial PRIMARY KEY,
      title text NOT NULL,
      description text,
      assignee text NOT NULL,
      priority text NOT NULL DEFAULT 'medium',
      status text NOT NULL DEFAULT 'backlog',
      project text NOT NULL,
      due_date text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS memories (
      id serial PRIMARY KEY,
      title text NOT NULL,
      content text NOT NULL,
      category text NOT NULL,
      preview text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS agents (
      id serial PRIMARY KEY,
      name text NOT NULL,
      role text NOT NULL,
      department text NOT NULL,
      is_lead boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'idle',
      current_task text,
      last_active text NOT NULL,
      responsibilities text,
      avatar_initials text NOT NULL,
      tasks_completed integer NOT NULL DEFAULT 0,
      success_rate integer NOT NULL DEFAULT 100,
      created_at timestamptz NOT NULL DEFAULT now(),
      is_plugged_in boolean NOT NULL DEFAULT false,
      provider text,
      model text,
      api_key text,
      endpoint text,
      inbound_token text,
      last_ping timestamptz
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id serial PRIMARY KEY,
      name text NOT NULL,
      role text NOT NULL,
      handle text,
      timezone text,
      category text NOT NULL,
      compensation text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS content (
      id serial PRIMARY KEY,
      title text NOT NULL,
      platform text NOT NULL,
      stage text NOT NULL DEFAULT 'idea',
      assigned_day text,
      script text,
      draft_link text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS events (
      id serial PRIMARY KEY,
      title text NOT NULL,
      description text,
      category text NOT NULL,
      start_date text NOT NULL,
      end_date text,
      all_day boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status text DEFAULT 'backlog';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

    ALTER TABLE memories ADD COLUMN IF NOT EXISTS content text;
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS category text DEFAULT 'UNMAPPED';
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS preview text;
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

    ALTER TABLE agents ADD COLUMN IF NOT EXISTS department text DEFAULT 'UNMAPPED';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_lead boolean DEFAULT false;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS status text DEFAULT 'idle';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS current_task text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_active text DEFAULT 'UNMAPPED';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS responsibilities text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_initials text DEFAULT 'UNMAPPED';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS tasks_completed integer DEFAULT 0;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS success_rate integer DEFAULT 100;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_plugged_in boolean DEFAULT false;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS provider text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS model text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS endpoint text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS inbound_token text;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_ping timestamptz;

    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS handle text;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS timezone text;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS category text DEFAULT 'UNMAPPED';
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS compensation text;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes text;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

    ALTER TABLE content ADD COLUMN IF NOT EXISTS title text;
    ALTER TABLE content ADD COLUMN IF NOT EXISTS platform text;
    ALTER TABLE content ADD COLUMN IF NOT EXISTS stage text DEFAULT 'idea';
    ALTER TABLE content ADD COLUMN IF NOT EXISTS assigned_day text;
    ALTER TABLE content ADD COLUMN IF NOT EXISTS script text;
    ALTER TABLE content ADD COLUMN IF NOT EXISTS draft_link text;
    ALTER TABLE content ADD COLUMN IF NOT EXISTS notes text;
    ALTER TABLE content ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE content ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

    ALTER TABLE events ADD COLUMN IF NOT EXISTS title text;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS category text DEFAULT 'UNMAPPED';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS start_date text;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date text;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS all_day boolean DEFAULT false;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

    UPDATE tasks SET assignee = 'UNMAPPED' WHERE assignee IS NULL;
    UPDATE tasks SET priority = 'medium' WHERE priority IS NULL;
    UPDATE tasks SET status = 'backlog' WHERE status IS NULL;
    UPDATE tasks SET project = 'UNMAPPED' WHERE project IS NULL;
    UPDATE tasks SET created_at = now() WHERE created_at IS NULL;
    UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL;

    UPDATE memories SET content = '' WHERE content IS NULL;
    UPDATE memories SET category = 'UNMAPPED' WHERE category IS NULL;
    UPDATE memories SET preview = left(content, 150) WHERE preview IS NULL;
    UPDATE memories SET created_at = now() WHERE created_at IS NULL;
    UPDATE memories SET updated_at = created_at WHERE updated_at IS NULL;

    UPDATE agents SET department = 'UNMAPPED' WHERE department IS NULL;
    UPDATE agents SET is_lead = false WHERE is_lead IS NULL;
    UPDATE agents SET status = 'idle' WHERE status IS NULL;
    UPDATE agents SET last_active = 'UNMAPPED' WHERE last_active IS NULL;
    UPDATE agents SET avatar_initials = 'UNMAPPED' WHERE avatar_initials IS NULL;
    UPDATE agents SET tasks_completed = 0 WHERE tasks_completed IS NULL;
    UPDATE agents SET success_rate = 100 WHERE success_rate IS NULL;
    UPDATE agents SET created_at = now() WHERE created_at IS NULL;
    UPDATE agents SET is_plugged_in = false WHERE is_plugged_in IS NULL;

    UPDATE contacts SET category = 'UNMAPPED' WHERE category IS NULL;
    UPDATE contacts SET created_at = now() WHERE created_at IS NULL;

    UPDATE content SET title = 'UNMAPPED' WHERE title IS NULL;
    UPDATE content SET platform = 'UNMAPPED' WHERE platform IS NULL;
    UPDATE content SET stage = 'idea' WHERE stage IS NULL;
    UPDATE content SET created_at = now() WHERE created_at IS NULL;
    UPDATE content SET updated_at = created_at WHERE updated_at IS NULL;

    UPDATE events SET title = 'UNMAPPED' WHERE title IS NULL;
    UPDATE events SET category = 'UNMAPPED' WHERE category IS NULL;
    UPDATE events SET start_date = 'UNMAPPED' WHERE start_date IS NULL;
    UPDATE events SET all_day = false WHERE all_day IS NULL;
    UPDATE events SET created_at = now() WHERE created_at IS NULL;

    ALTER TABLE tasks ALTER COLUMN assignee SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN priority SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN status SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN project SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN created_at SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN updated_at SET NOT NULL;

    ALTER TABLE memories ALTER COLUMN content SET NOT NULL;
    ALTER TABLE memories ALTER COLUMN category SET NOT NULL;
    ALTER TABLE memories ALTER COLUMN preview SET NOT NULL;
    ALTER TABLE memories ALTER COLUMN created_at SET NOT NULL;
    ALTER TABLE memories ALTER COLUMN updated_at SET NOT NULL;

    ALTER TABLE agents ALTER COLUMN department SET NOT NULL;
    ALTER TABLE agents ALTER COLUMN is_lead SET NOT NULL;
    ALTER TABLE agents ALTER COLUMN status SET NOT NULL;
    ALTER TABLE agents ALTER COLUMN last_active SET NOT NULL;
    ALTER TABLE agents ALTER COLUMN avatar_initials SET NOT NULL;
    ALTER TABLE agents ALTER COLUMN tasks_completed SET NOT NULL;
    ALTER TABLE agents ALTER COLUMN success_rate SET NOT NULL;
    ALTER TABLE agents ALTER COLUMN created_at SET NOT NULL;
    ALTER TABLE agents ALTER COLUMN is_plugged_in SET NOT NULL;

    ALTER TABLE contacts ALTER COLUMN category SET NOT NULL;
    ALTER TABLE contacts ALTER COLUMN created_at SET NOT NULL;

    ALTER TABLE content ALTER COLUMN title SET NOT NULL;
    ALTER TABLE content ALTER COLUMN platform SET NOT NULL;
    ALTER TABLE content ALTER COLUMN stage SET NOT NULL;
    ALTER TABLE content ALTER COLUMN created_at SET NOT NULL;
    ALTER TABLE content ALTER COLUMN updated_at SET NOT NULL;

    ALTER TABLE events ALTER COLUMN title SET NOT NULL;
    ALTER TABLE events ALTER COLUMN category SET NOT NULL;
    ALTER TABLE events ALTER COLUMN start_date SET NOT NULL;
    ALTER TABLE events ALTER COLUMN all_day SET NOT NULL;
    ALTER TABLE events ALTER COLUMN created_at SET NOT NULL;

    CREATE INDEX IF NOT EXISTS content_created_at_idx ON content (created_at);
    CREATE INDEX IF NOT EXISTS events_start_date_idx ON events (start_date);
  `);
}
