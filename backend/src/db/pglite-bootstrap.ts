import type { PGlite } from "@electric-sql/pglite";

const pgliteBootstrapSql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'editor', 'viewer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_mode') THEN
    CREATE TYPE auth_mode AS ENUM ('local', 'oidc');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'backend_auth_type') THEN
    CREATE TYPE backend_auth_type AS ENUM ('none', 'api_key', 'basic', 'bearer', 'oauth2');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'secret_type') THEN
    CREATE TYPE secret_type AS ENUM ('api_key', 'token', 'password', 'certificate', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'secret_storage_mode') THEN
    CREATE TYPE secret_storage_mode AS ENUM ('database', 'external_ref');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'snapshot_status') THEN
    CREATE TYPE snapshot_status AS ENUM ('draft', 'published', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'draft_status') THEN
    CREATE TYPE draft_status AS ENUM ('draft', 'validated', 'invalid');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_idx ON organizations (slug);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  encrypted_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_server_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  issuer text NOT NULL,
  jwks_uri text NOT NULL,
  token_endpoint text,
  client_id text,
  encrypted_client_secret text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE auth_server_configs DROP COLUMN IF EXISTS authorization_server_metadata_url;
ALTER TABLE auth_server_configs ADD COLUMN IF NOT EXISTS token_endpoint text;
ALTER TABLE auth_server_configs ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE auth_server_configs ADD COLUMN IF NOT EXISTS encrypted_client_secret text;
CREATE UNIQUE INDEX IF NOT EXISTS auth_server_configs_org_idx ON auth_server_configs (organization_id);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  username text NOT NULL,
  name text NOT NULL,
  role user_role NOT NULL,
  auth_mode auth_mode NOT NULL,
  password_hash text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_org_username_idx ON users (organization_id, username);
CREATE INDEX IF NOT EXISTS users_org_idx ON users (organization_id);

CREATE TABLE IF NOT EXISTS backend_apis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  default_base_url text NOT NULL,
  auth_type backend_auth_type NOT NULL DEFAULT 'none',
  auth_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_exchange_enabled boolean NOT NULL DEFAULT false,
  token_exchange_audience text,
  default_timeout_ms integer NOT NULL DEFAULT 30000,
  retry_policy jsonb NOT NULL DEFAULT '{"retries":0}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE backend_apis ADD COLUMN IF NOT EXISTS token_exchange_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE backend_apis ADD COLUMN IF NOT EXISTS token_exchange_audience text;
CREATE UNIQUE INDEX IF NOT EXISTS backend_apis_org_slug_idx ON backend_apis (organization_id, slug);
CREATE INDEX IF NOT EXISTS backend_apis_org_idx ON backend_apis (organization_id);

CREATE TABLE IF NOT EXISTS backend_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backend_api_id uuid NOT NULL REFERENCES backend_apis(id) ON DELETE CASCADE,
  environment_name text NOT NULL,
  base_url text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS backend_env_api_name_idx ON backend_environments (backend_api_id, environment_name);
CREATE INDEX IF NOT EXISTS backend_env_api_idx ON backend_environments (backend_api_id);

CREATE TABLE IF NOT EXISTS backend_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backend_api_id uuid NOT NULL REFERENCES backend_apis(id) ON DELETE CASCADE,
  name text NOT NULL,
  operation_id text NOT NULL,
  description text,
  http_method text NOT NULL,
  path_template text NOT NULL,
  body_template text,
  request_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE backend_resources ADD COLUMN IF NOT EXISTS body_template text;
CREATE UNIQUE INDEX IF NOT EXISTS backend_resources_api_operation_idx ON backend_resources (backend_api_id, operation_id);
CREATE INDEX IF NOT EXISTS backend_resources_api_idx ON backend_resources (backend_api_id);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  title text NOT NULL,
  description text,
  auth_mode auth_mode NOT NULL DEFAULT 'local',
  access_mode text NOT NULL DEFAULT 'public',
  audience text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'public';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS audience text;
CREATE UNIQUE INDEX IF NOT EXISTS mcp_servers_org_slug_idx ON mcp_servers (organization_id, slug);
CREATE INDEX IF NOT EXISTS mcp_servers_org_idx ON mcp_servers (organization_id);

CREATE TABLE IF NOT EXISTS tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_server_id uuid NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_level text NOT NULL DEFAULT 'low',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tools_server_slug_idx ON tools (mcp_server_id, slug);
CREATE INDEX IF NOT EXISTS tools_server_idx ON tools (mcp_server_id);

CREATE TABLE IF NOT EXISTS scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  is_sensitive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS scopes_org_name_idx ON scopes (organization_id, name);
CREATE INDEX IF NOT EXISTS scopes_org_idx ON scopes (organization_id);

CREATE TABLE IF NOT EXISTS tool_scopes (
  tool_id uuid NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  scope_id uuid NOT NULL REFERENCES scopes(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS tool_scopes_tool_scope_idx ON tool_scopes (tool_id, scope_id);
CREATE INDEX IF NOT EXISTS tool_scopes_tool_idx ON tool_scopes (tool_id);
CREATE INDEX IF NOT EXISTS tool_scopes_scope_idx ON tool_scopes (scope_id);

CREATE TABLE IF NOT EXISTS tool_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  backend_api_id uuid NOT NULL REFERENCES backend_apis(id) ON DELETE RESTRICT,
  backend_resource_id uuid NOT NULL REFERENCES backend_resources(id) ON DELETE RESTRICT,
  request_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  auth_strategy text NOT NULL DEFAULT 'inherit',
  timeout_override_ms integer,
  retry_override jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tool_mappings_tool_idx ON tool_mappings (tool_id);
CREATE INDEX IF NOT EXISTS tool_mappings_backend_api_idx ON tool_mappings (backend_api_id);
CREATE INDEX IF NOT EXISTS tool_mappings_backend_resource_idx ON tool_mappings (backend_resource_id);

CREATE TABLE IF NOT EXISTS secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  secret_type secret_type NOT NULL DEFAULT 'other',
  storage_mode secret_storage_mode NOT NULL,
  external_ref text,
  encrypted_value text,
  key_version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS secrets_org_name_idx ON secrets (organization_id, name);
CREATE INDEX IF NOT EXISTS secrets_org_idx ON secrets (organization_id);

CREATE TABLE IF NOT EXISTS draft_config_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status draft_status NOT NULL DEFAULT 'draft',
  last_edited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS draft_config_states_org_idx ON draft_config_states (organization_id);

CREATE TABLE IF NOT EXISTS runtime_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status snapshot_status NOT NULL DEFAULT 'published',
  snapshot_json jsonb NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS runtime_snapshots_org_version_idx ON runtime_snapshots (organization_id, version);
CREATE INDEX IF NOT EXISTS runtime_snapshots_org_idx ON runtime_snapshots (organization_id);

CREATE TABLE IF NOT EXISTS publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES runtime_snapshots(id) ON DELETE CASCADE,
  version integer NOT NULL,
  published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publish_events_org_idx ON publish_events (organization_id);
CREATE INDEX IF NOT EXISTS publish_events_snapshot_idx ON publish_events (snapshot_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_type text NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_org_idx ON audit_events (organization_id);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_id);

CREATE TABLE IF NOT EXISTS execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mcp_server_id uuid REFERENCES mcp_servers(id) ON DELETE SET NULL,
  tool_id uuid REFERENCES tools(id) ON DELETE SET NULL,
  request_id text NOT NULL,
  trace_id text,
  status text NOT NULL,
  backend_status integer,
  latency_ms integer,
  input_payload jsonb,
  output_payload jsonb,
  error_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS execution_logs_org_idx ON execution_logs (organization_id);
CREATE INDEX IF NOT EXISTS execution_logs_request_idx ON execution_logs (request_id);
CREATE INDEX IF NOT EXISTS execution_logs_tool_idx ON execution_logs (tool_id);
`;

export const ensurePgliteSchema = async (client: PGlite) => {
  const result = await client.query<{ table_name: string | null }>(
    "SELECT to_regclass('public.organizations') AS table_name"
  );

  await client.exec(pgliteBootstrapSql);
  return result.rows[0]?.table_name !== "organizations";
};
