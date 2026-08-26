import { sql } from "drizzle-orm";

type SqlExecutor = { execute(query: ReturnType<typeof sql>): Promise<unknown> };

export async function ensureAgentProvisioningSchema(database: SqlExecutor): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS secrets_vault (
      id serial PRIMARY KEY,
      name text NOT NULL,
      kind text NOT NULL DEFAULT 'api_key',
      provider text,
      encrypted_value text NOT NULL,
      value_hint text,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS secrets_vault_name_uidx ON secrets_vault(name);

    CREATE TABLE IF NOT EXISTS runtime_hosts (
      id serial PRIMARY KEY,
      name text NOT NULL,
      runtime_type text NOT NULL,
      host_type text NOT NULL DEFAULT 'local',
      root_dir text NOT NULL,
      cli_path text,
      status text NOT NULL DEFAULT 'unknown',
      capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
      last_health_check timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS runtime_hosts_name_uidx ON runtime_hosts(name);

    CREATE TABLE IF NOT EXISTS employee_templates (
      id serial PRIMARY KEY,
      name text NOT NULL,
      description text,
      runtime_type text NOT NULL,
      provider text,
      model text,
      department text,
      identity_template text,
      soul_template text,
      agent_template text,
      user_template text,
      skill_names jsonb NOT NULL DEFAULT '[]'::jsonb,
      default_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS employee_templates_name_uidx ON employee_templates(name);

    CREATE TABLE IF NOT EXISTS agent_runtime_instances (
      id serial PRIMARY KEY,
      agent_id integer NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      runtime_host_id integer REFERENCES runtime_hosts(id) ON DELETE SET NULL,
      runtime_type text NOT NULL,
      runtime_agent_id text,
      workspace_path text,
      model text,
      status text NOT NULL DEFAULT 'pending',
      health text NOT NULL DEFAULT 'unknown',
      last_error text,
      provisioned_at timestamptz,
      last_health_check timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS agent_runtime_instances_agent_uidx ON agent_runtime_instances(agent_id);
    CREATE UNIQUE INDEX IF NOT EXISTS agent_runtime_instances_runtime_agent_uidx ON agent_runtime_instances(runtime_type, runtime_agent_id) WHERE runtime_agent_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS agent_secret_grants (
      id serial PRIMARY KEY,
      agent_id integer NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      secret_id integer NOT NULL REFERENCES secrets_vault(id) ON DELETE CASCADE,
      purpose text NOT NULL DEFAULT 'runtime',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS agent_secret_grants_uidx ON agent_secret_grants(agent_id, secret_id, purpose);

    CREATE TABLE IF NOT EXISTS agent_employee_profiles (
      agent_id integer PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
      project_id integer REFERENCES projects(id) ON DELETE SET NULL,
      project_name text,
      avatar_data_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS agent_profile_definitions (
      agent_id integer PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
      profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      generated_files jsonb NOT NULL DEFAULT '{}'::jsonb,
      version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO runtime_hosts (name, runtime_type, host_type, root_dir, cli_path, status, capabilities)
    VALUES (
      'Hostinger Production',
      'openclaw',
      'local',
      '/root/.openclaw',
      'openclaw',
      'unknown',
      '{"multiAgent":true,"managed":true,"channels":["whatsapp","line"]}'::jsonb
    ) ON CONFLICT (name) DO NOTHING;

    INSERT INTO employee_templates (
      name, description, runtime_type, provider, model, department,
      identity_template, soul_template, agent_template, user_template, skill_names, default_permissions
    ) VALUES (
      'OpenClaw Employee',
      'General isolated employee provisioned on the managed OpenClaw runtime.',
      'openclaw', 'openrouter', 'openrouter/auto', 'Operations',
      '# {{name}}\n\nRole: {{role}}\nBusiness: {{business}}\n',
      '# Working style\n\nAct like a dependable employee. Be proactive, factual, concise, and never claim work that was not completed.\n',
      '# Responsibilities\n\n{{responsibilities}}\n\nUse assigned tools and skills only. Escalate actions that require owner approval.\n',
      '# People and business context\n\nBusiness: {{business}}\nPrimary owner: {{owner}}\n',
      '[]'::jsonb,
      '{}'::jsonb
    ) ON CONFLICT (name) DO NOTHING;
  `);
}
