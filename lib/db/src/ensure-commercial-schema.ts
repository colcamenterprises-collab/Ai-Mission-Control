import { sql } from "drizzle-orm";

type SqlExecutor = { execute(query: ReturnType<typeof sql>): Promise<unknown> };
export const BOOTSTRAP_ORG_SLUG = "customli";

export async function ensureCommercialSchema(database: SqlExecutor): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id serial PRIMARY KEY, slug text NOT NULL UNIQUE, name text NOT NULL,
      status text NOT NULL DEFAULT 'active', industry text, country text,
      timezone text NOT NULL DEFAULT 'Asia/Bangkok', website text, contact_email text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS organization_memberships (
      id serial PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      principal_type text NOT NULL, principal_id text NOT NULL, role text NOT NULL DEFAULT 'member',
      status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(organization_id, principal_type, principal_id)
    );
    CREATE TABLE IF NOT EXISTS organization_plans (
      id serial PRIMARY KEY, organization_id integer NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      plan_key text NOT NULL DEFAULT 'founder', billing_status text NOT NULL DEFAULT 'not_configured',
      entitlements jsonb NOT NULL DEFAULT '{}'::jsonb, ai_budget_usd_monthly integer,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS organization_branding (
      id serial PRIMARY KEY, organization_id integer NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      display_name text, logo_url text, primary_color text, secondary_color text, accent_color text,
      theme text NOT NULL DEFAULT 'dark', updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS organization_onboarding (
      id serial PRIMARY KEY, organization_id integer NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      business_profile_complete boolean NOT NULL DEFAULT false, branding_complete boolean NOT NULL DEFAULT false,
      modules_selected boolean NOT NULL DEFAULT false, knowledge_imported boolean NOT NULL DEFAULT false,
      first_agent_created boolean NOT NULL DEFAULT false, first_workflow_certified boolean NOT NULL DEFAULT false,
      selected_modules jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO organizations (slug, name, timezone, country)
    VALUES ('customli', 'Customli', 'Asia/Bangkok', 'Thailand')
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO organization_memberships (organization_id, principal_type, principal_id, role)
    SELECT id, 'owner', 'bootstrap-owner', 'owner' FROM organizations WHERE slug='customli'
    ON CONFLICT (organization_id, principal_type, principal_id) DO NOTHING;
    INSERT INTO organization_plans (organization_id, plan_key, billing_status, entitlements)
    SELECT id, 'founder', 'not_configured', '{"ai_team":true,"tasks":true,"knowledge":true,"approvals":true,"mission_brain":true}'::jsonb
    FROM organizations WHERE slug='customli' ON CONFLICT (organization_id) DO NOTHING;
    INSERT INTO organization_branding (organization_id, display_name, theme)
    SELECT id, 'Customli', 'dark' FROM organizations WHERE slug='customli' ON CONFLICT (organization_id) DO NOTHING;
    INSERT INTO organization_onboarding (organization_id, business_profile_complete, branding_complete, modules_selected, first_agent_created, first_workflow_certified, selected_modules)
    SELECT id, true, true, true, true, true, '["overview","tasks","ai_team","knowledge","mission_brain"]'::jsonb
    FROM organizations WHERE slug='customli' ON CONFLICT (organization_id) DO NOTHING;
  `);
}
