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
export async function ensureOperationalSchema(
  database: SqlExecutor,
): Promise<void> {
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
      recurrence text NOT NULL DEFAULT 'one_off',
      approval_required boolean NOT NULL DEFAULT false,
      owner_review_required boolean NOT NULL DEFAULT false,
      unread_messages integer NOT NULL DEFAULT 0,
      attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
      report text,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_review_required boolean NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS task_messages (
      id serial PRIMARY KEY,
      task_id integer NOT NULL,
      author text NOT NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      description text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Additive raw-capture store. It has no execution/work-request foreign key
    -- by design; promotion is explicit and idempotent through linked_task_id.
    CREATE TABLE IF NOT EXISTS inbox_items (
      id serial PRIMARY KEY,
      title text,
      content text NOT NULL,
      source text NOT NULL DEFAULT 'typed' CHECK (source IN ('typed', 'voice_transcript', 'imported', 'agent')),
      created_by text NOT NULL,
      review_status text NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed', 'reviewed', 'promoted', 'dismissed', 'archived')),
      reviewed_at timestamptz,
      orchestrator_comment text,
      linked_task_id integer UNIQUE REFERENCES tasks(id) ON DELETE SET NULL,
      linked_project_id integer REFERENCES projects(id) ON DELETE SET NULL,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS inbox_items_review_idx ON inbox_items(review_status, archived_at);

    CREATE TABLE IF NOT EXISTS project_task_archives (
      id serial PRIMARY KEY,
      task_id integer NOT NULL UNIQUE,
      project text NOT NULL,
      archive jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
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

    CREATE TABLE IF NOT EXISTS activity (
      id serial PRIMARY KEY,
      agent_name text NOT NULL,
      action text NOT NULL,
      detail text,
      status text NOT NULL DEFAULT 'idle',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS integrations (
      id serial PRIMARY KEY,
      name text NOT NULL,
      url text NOT NULL,
      description text,
      category text NOT NULL DEFAULT 'custom',
      icon_initials text NOT NULL,
      icon_color text NOT NULL DEFAULT 'from-slate-600 to-slate-800',
      status text NOT NULL DEFAULT 'connected',
      api_key text,
      is_public boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS agent_integrations (
      id serial PRIMARY KEY,
      agent_id integer NOT NULL,
      integration_id integer NOT NULL,
      role text,
      assigned_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS credential_type text NOT NULL DEFAULT 'public';
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS username text;
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS password text;
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS custom_credential text;

    CREATE TABLE IF NOT EXISTS agent_commands (
      id serial PRIMARY KEY,
      agent_id integer NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      instructions text NOT NULL,
      context text,
      task_id integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      acknowledged_at timestamptz,
      delivered_via_http boolean NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS agent_tools (
      id serial PRIMARY KEY,
      name text NOT NULL,
      description text,
      url text,
      category text NOT NULL DEFAULT 'custom',
      credential_type text NOT NULL DEFAULT 'api_key',
      api_key text,
      username text,
      password text,
      notes text,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS agent_tool_access (
      id serial PRIMARY KEY,
      agent_id integer NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      tool_id integer NOT NULL REFERENCES agent_tools(id) ON DELETE CASCADE,
      granted_at timestamptz NOT NULL DEFAULT now()
    );

    -- Derived execution control plane. These tables are additive, rebuildable
    -- from canonical tasks plus their immutable transition/audit records, and
    -- never rewrite task source data during schema installation.
    CREATE TABLE IF NOT EXISTS work_requests (
      id serial PRIMARY KEY, execution_key text NOT NULL UNIQUE, task_id integer REFERENCES tasks(id) ON DELETE SET NULL,
      agent_id integer REFERENCES agents(id) ON DELETE SET NULL, requested_action text NOT NULL, state text NOT NULL DEFAULT 'draft',
      risk_level integer NOT NULL DEFAULT 0 CHECK (risk_level BETWEEN 0 AND 4), approval_decision text NOT NULL DEFAULT 'AUTO_EXECUTE',
      routing_reason text, business text, project text, runtime text, provider text, model text, repository text, environment text,
      requirements jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb, owner_report text, error text,
      input_tokens integer, output_tokens integer, cached_tokens integer, provider_cost numeric(14,6), tool_calls integer,
      retry_count integer NOT NULL DEFAULT 0, acknowledged_at timestamptz, started_at timestamptz, finished_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 1;
    ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS idempotency_class text NOT NULL DEFAULT 'side_effecting';
    ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS claimed_by_agent_id integer REFERENCES agents(id) ON DELETE SET NULL;
    ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
    ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS last_progress_at timestamptz;
    ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS progress jsonb;
    CREATE TABLE IF NOT EXISTS agent_execution_scopes (
      id serial PRIMARY KEY, agent_id integer NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      scope_type text NOT NULL, scope_value text NOT NULL, operation text NOT NULL DEFAULT 'use',
      granted_by text NOT NULL, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(agent_id, scope_type, scope_value, operation)
    );
    CREATE INDEX IF NOT EXISTS agent_execution_scopes_lookup_idx ON agent_execution_scopes(agent_id, scope_type, scope_value);
    CREATE TABLE IF NOT EXISTS execution_instructions (id serial PRIMARY KEY, request_id integer NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE, instruction_type text NOT NULL, stable_id text NOT NULL, name text NOT NULL, version text, provenance text, selection_reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id, instruction_type, stable_id));
    CREATE TABLE IF NOT EXISTS memory_metadata (id serial PRIMARY KEY, memory_id integer NOT NULL UNIQUE REFERENCES memories(id) ON DELETE CASCADE, tier text NOT NULL DEFAULT 'WARM', provenance text NOT NULL, confidence numeric(5,4), status text NOT NULL DEFAULT 'active', business text, project text, source text, created_by text NOT NULL, updated_by text NOT NULL, valid_from timestamptz, valid_until timestamptz, last_verified timestamptz, supersedes_memory_id integer, access_policy text NOT NULL DEFAULT 'owner_only', version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS memory_revisions (id serial PRIMARY KEY, memory_id integer NOT NULL REFERENCES memories(id) ON DELETE CASCADE, version integer NOT NULL, title text NOT NULL, content text NOT NULL, category text NOT NULL, changed_by text NOT NULL, provenance text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(memory_id, version));
    CREATE TABLE IF NOT EXISTS memory_agent_grants (id serial PRIMARY KEY, memory_id integer NOT NULL REFERENCES memories(id) ON DELETE CASCADE, agent_id integer NOT NULL REFERENCES agents(id) ON DELETE CASCADE, access text NOT NULL DEFAULT 'read', granted_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(memory_id, agent_id, access));
    CREATE INDEX IF NOT EXISTS memory_metadata_scope_idx ON memory_metadata(business, project, status);
    CREATE TABLE IF NOT EXISTS signals (id serial PRIMARY KEY, source text NOT NULL, business text, project text, category text NOT NULL, title text NOT NULL, evidence jsonb NOT NULL, confidence numeric(5,4), severity text, urgency text, actionability text, owner text, linked_task_id integer REFERENCES tasks(id) ON DELETE SET NULL, status text NOT NULL DEFAULT 'new', detected_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS signals_status_idx ON signals(status, detected_at);
    CREATE TABLE IF NOT EXISTS account_sources (id serial PRIMARY KEY, provider text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'not_connected', last_sync_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS account_health (id serial PRIMARY KEY, account_key text NOT NULL UNIQUE, name text NOT NULL, business text, services jsonb NOT NULL DEFAULT '[]'::jsonb, account_owner text, renewal_date timestamptz, last_meaningful_contact timestamptz, outstanding_request text, response_cadence text, needs_reply text, positive_signals jsonb NOT NULL DEFAULT '[]'::jsonb, negative_signals jsonb NOT NULL DEFAULT '[]'::jsonb, risk text, recommended_action text, evidence jsonb NOT NULL DEFAULT '[]'::jsonb, source_status text NOT NULL DEFAULT 'NO_DATA', updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS work_request_transitions (
      id serial PRIMARY KEY, request_id integer NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE,
      from_state text, to_state text NOT NULL, actor_type text NOT NULL, actor_id text, reason text,
      context jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id serial PRIMARY KEY, request_id integer NOT NULL UNIQUE REFERENCES work_requests(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'pending', required_authority text NOT NULL, reason text NOT NULL, expected_effect text,
      rollback_plan text, proposed_action text NOT NULL, decided_by text, decision_note text, decided_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id serial PRIMARY KEY, event_type text NOT NULL, actor_type text NOT NULL, actor_id text,
      request_id integer REFERENCES work_requests(id) ON DELETE SET NULL, task_id integer REFERENCES tasks(id) ON DELETE SET NULL,
      agent_id integer REFERENCES agents(id) ON DELETE SET NULL, outcome text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb, redacted boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS work_requests_execution_key_uidx ON work_requests(execution_key);
    CREATE INDEX IF NOT EXISTS work_requests_state_idx ON work_requests(state);
    CREATE INDEX IF NOT EXISTS work_requests_agent_state_idx ON work_requests(agent_id, state);
    CREATE INDEX IF NOT EXISTS work_requests_task_idx ON work_requests(task_id);
    CREATE INDEX IF NOT EXISTS work_request_transitions_request_idx ON work_request_transitions(request_id, created_at);
    CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(status, created_at);
    CREATE INDEX IF NOT EXISTS audit_events_type_created_idx ON audit_events(event_type, created_at);
    CREATE INDEX IF NOT EXISTS audit_events_request_idx ON audit_events(request_id, created_at);

    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status text DEFAULT 'backlog';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence text DEFAULT 'one_off';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_required boolean DEFAULT false;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS unread_messages integer DEFAULT 0;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS report text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz;
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

    ALTER TABLE activity ADD COLUMN IF NOT EXISTS agent_name text;
    ALTER TABLE activity ADD COLUMN IF NOT EXISTS action text;
    ALTER TABLE activity ADD COLUMN IF NOT EXISTS detail text;
    ALTER TABLE activity ADD COLUMN IF NOT EXISTS status text DEFAULT 'idle';
    ALTER TABLE activity ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS name text;
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS url text;
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS category text DEFAULT 'custom';
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS icon_initials text DEFAULT 'IN';
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS icon_color text DEFAULT 'from-slate-600 to-slate-800';
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS status text DEFAULT 'connected';
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS api_key text;
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;
    ALTER TABLE integrations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

    ALTER TABLE agent_integrations ADD COLUMN IF NOT EXISTS agent_id integer;
    ALTER TABLE agent_integrations ADD COLUMN IF NOT EXISTS integration_id integer;
    ALTER TABLE agent_integrations ADD COLUMN IF NOT EXISTS role text;
    ALTER TABLE agent_integrations ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT now();

    ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS agent_id integer;
    ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS instructions text;
    ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS context text;
    ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS task_id integer;
    ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
    ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS delivered_via_http boolean DEFAULT false;

    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS name text;
    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS url text;
    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS category text DEFAULT 'custom';
    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS credential_type text DEFAULT 'api_key';
    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS api_key text;
    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS username text;
    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS password text;
    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS notes text;
    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
    ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

    ALTER TABLE agent_tool_access ADD COLUMN IF NOT EXISTS agent_id integer;
    ALTER TABLE agent_tool_access ADD COLUMN IF NOT EXISTS tool_id integer;
    ALTER TABLE agent_tool_access ADD COLUMN IF NOT EXISTS granted_at timestamptz DEFAULT now();

    UPDATE tasks SET assignee = 'UNMAPPED' WHERE assignee IS NULL;
    UPDATE tasks SET priority = 'medium' WHERE priority IS NULL;
    UPDATE tasks SET status = 'backlog' WHERE status IS NULL;
    UPDATE tasks SET project = 'UNMAPPED' WHERE project IS NULL;
    UPDATE tasks SET created_at = now() WHERE created_at IS NULL;
    UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL;
    UPDATE tasks SET recurrence = 'one_off' WHERE recurrence IS NULL;
    UPDATE tasks SET approval_required = false WHERE approval_required IS NULL;
    UPDATE tasks SET unread_messages = 0 WHERE unread_messages IS NULL;
    UPDATE tasks SET attachments = '[]'::jsonb WHERE attachments IS NULL;

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

    UPDATE activity SET agent_name = 'UNMAPPED' WHERE agent_name IS NULL;
    UPDATE activity SET action = 'UNMAPPED' WHERE action IS NULL;
    UPDATE activity SET status = 'idle' WHERE status IS NULL;
    UPDATE activity SET created_at = now() WHERE created_at IS NULL;

    UPDATE integrations SET name = 'UNMAPPED' WHERE name IS NULL;
    UPDATE integrations SET url = 'UNMAPPED' WHERE url IS NULL;
    UPDATE integrations SET category = 'custom' WHERE category IS NULL;
    UPDATE integrations SET icon_initials = 'IN' WHERE icon_initials IS NULL;
    UPDATE integrations SET icon_color = 'from-slate-600 to-slate-800' WHERE icon_color IS NULL;
    UPDATE integrations SET status = 'connected' WHERE status IS NULL;
    UPDATE integrations SET is_public = false WHERE is_public IS NULL;
    UPDATE integrations SET created_at = now() WHERE created_at IS NULL;

    UPDATE agent_integrations SET assigned_at = now() WHERE assigned_at IS NULL;
    UPDATE agent_commands SET created_at = now() WHERE created_at IS NULL;
    UPDATE agent_commands SET delivered_via_http = false WHERE delivered_via_http IS NULL;
    UPDATE agent_tools SET category = 'custom' WHERE category IS NULL;
    UPDATE agent_tools SET credential_type = 'api_key' WHERE credential_type IS NULL;
    UPDATE agent_tools SET is_active = true WHERE is_active IS NULL;
    UPDATE agent_tools SET created_at = now() WHERE created_at IS NULL;
    UPDATE agent_tool_access SET granted_at = now() WHERE granted_at IS NULL;

    ALTER TABLE tasks ALTER COLUMN assignee SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN priority SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN status SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN project SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN created_at SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN updated_at SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN recurrence SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN approval_required SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN unread_messages SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN attachments SET NOT NULL;

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

    ALTER TABLE activity ALTER COLUMN agent_name SET NOT NULL;
    ALTER TABLE activity ALTER COLUMN action SET NOT NULL;
    ALTER TABLE activity ALTER COLUMN status SET NOT NULL;
    ALTER TABLE activity ALTER COLUMN created_at SET NOT NULL;

    ALTER TABLE integrations ALTER COLUMN name SET NOT NULL;
    ALTER TABLE integrations ALTER COLUMN url SET NOT NULL;
    ALTER TABLE integrations ALTER COLUMN category SET NOT NULL;
    ALTER TABLE integrations ALTER COLUMN icon_initials SET NOT NULL;
    ALTER TABLE integrations ALTER COLUMN icon_color SET NOT NULL;
    ALTER TABLE integrations ALTER COLUMN status SET NOT NULL;
    ALTER TABLE integrations ALTER COLUMN is_public SET NOT NULL;
    ALTER TABLE integrations ALTER COLUMN created_at SET NOT NULL;

    ALTER TABLE agent_commands ALTER COLUMN agent_id SET NOT NULL;
    ALTER TABLE agent_commands ALTER COLUMN instructions SET NOT NULL;
    ALTER TABLE agent_commands ALTER COLUMN created_at SET NOT NULL;
    ALTER TABLE agent_commands ALTER COLUMN delivered_via_http SET NOT NULL;

    ALTER TABLE agent_tools ALTER COLUMN name SET NOT NULL;
    ALTER TABLE agent_tools ALTER COLUMN category SET NOT NULL;
    ALTER TABLE agent_tools ALTER COLUMN credential_type SET NOT NULL;
    ALTER TABLE agent_tools ALTER COLUMN is_active SET NOT NULL;
    ALTER TABLE agent_tools ALTER COLUMN created_at SET NOT NULL;

    ALTER TABLE agent_tool_access ALTER COLUMN agent_id SET NOT NULL;
    ALTER TABLE agent_tool_access ALTER COLUMN tool_id SET NOT NULL;
    ALTER TABLE agent_tool_access ALTER COLUMN granted_at SET NOT NULL;

    CREATE INDEX IF NOT EXISTS content_created_at_idx ON content (created_at);
    CREATE INDEX IF NOT EXISTS events_start_date_idx ON events (start_date);
    CREATE INDEX IF NOT EXISTS tasks_assignee_status_idx ON tasks (assignee, status);
    CREATE INDEX IF NOT EXISTS task_messages_task_created_idx ON task_messages (task_id, created_at);
    CREATE INDEX IF NOT EXISTS project_task_archives_project_idx ON project_task_archives (project, created_at);
    CREATE INDEX IF NOT EXISTS agent_commands_agent_ack_idx ON agent_commands (agent_id, acknowledged_at);
    CREATE INDEX IF NOT EXISTS agent_tool_access_agent_idx ON agent_tool_access (agent_id);
    CREATE INDEX IF NOT EXISTS activity_created_at_idx ON activity (created_at);
  `);
}
