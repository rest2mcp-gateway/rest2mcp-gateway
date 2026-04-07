import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
};

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "editor", "viewer"]);
export const authModeEnum = pgEnum("auth_mode", ["local", "oidc"]);
export const backendAuthTypeEnum = pgEnum("backend_auth_type", ["none", "api_key", "basic", "bearer", "oauth2"]);
export const secretTypeEnum = pgEnum("secret_type", ["api_key", "token", "password", "certificate", "other"]);
export const secretStorageModeEnum = pgEnum("secret_storage_mode", ["database", "external_ref"]);
export const snapshotStatusEnum = pgEnum("snapshot_status", ["draft", "published", "archived"]);
export const draftStatusEnum = pgEnum("draft_status", ["draft", "validated", "invalid"]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ...timestamps
}, (table) => ({
  slugIdx: uniqueIndex("organizations_slug_idx").on(table.slug)
}));

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  encryptedValue: text("encrypted_value").notNull(),
  ...timestamps
});

export const authServerConfigs = pgTable("auth_server_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  issuer: text("issuer").notNull(),
  jwksUri: text("jwks_uri").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => ({
  orgIdx: uniqueIndex("auth_server_configs_org_idx").on(table.organizationId)
}));

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull(),
  authMode: authModeEnum("auth_mode").notNull(),
  passwordHash: text("password_hash"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps
}, (table) => ({
  orgUsernameIdx: uniqueIndex("users_org_username_idx").on(table.organizationId, table.username),
  orgIdx: index("users_org_idx").on(table.organizationId)
}));

export const backendApis = pgTable("backend_apis", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  defaultBaseUrl: text("default_base_url").notNull(),
  authType: backendAuthTypeEnum("auth_type").notNull().default("none"),
  authConfig: jsonb("auth_config").notNull().default({}),
  defaultTimeoutMs: integer("default_timeout_ms").notNull().default(30000),
  retryPolicy: jsonb("retry_policy").notNull().default({ retries: 0 }),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps
}, (table) => ({
  orgSlugIdx: uniqueIndex("backend_apis_org_slug_idx").on(table.organizationId, table.slug),
  orgIdx: index("backend_apis_org_idx").on(table.organizationId)
}));

export const backendEnvironments = pgTable("backend_environments", {
  id: uuid("id").primaryKey().defaultRandom(),
  backendApiId: uuid("backend_api_id").notNull().references(() => backendApis.id, { onDelete: "cascade" }),
  environmentName: text("environment_name").notNull(),
  baseUrl: text("base_url").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  ...timestamps
}, (table) => ({
  apiIdx: index("backend_env_api_idx").on(table.backendApiId),
  apiEnvIdx: uniqueIndex("backend_env_api_name_idx").on(table.backendApiId, table.environmentName)
}));

export const backendResources = pgTable("backend_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  backendApiId: uuid("backend_api_id").notNull().references(() => backendApis.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  operationId: text("operation_id").notNull(),
  description: text("description"),
  httpMethod: text("http_method").notNull(),
  pathTemplate: text("path_template").notNull(),
  bodyTemplate: text("body_template"),
  requestSchema: jsonb("request_schema").notNull().default({}),
  responseSchema: jsonb("response_schema").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps
}, (table) => ({
  apiIdx: index("backend_resources_api_idx").on(table.backendApiId),
  apiOpIdx: uniqueIndex("backend_resources_api_operation_idx").on(table.backendApiId, table.operationId)
}));

export const mcpServers = pgTable("mcp_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  version: text("version").notNull().default("1.0.0"),
  title: text("title").notNull(),
  description: text("description"),
  authMode: authModeEnum("auth_mode").notNull().default("local"),
  accessMode: text("access_mode").notNull().default("public"),
  audience: text("audience"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps
}, (table) => ({
  orgSlugIdx: uniqueIndex("mcp_servers_org_slug_idx").on(table.organizationId, table.slug),
  orgIdx: index("mcp_servers_org_idx").on(table.organizationId)
}));

export const tools = pgTable("tools", {
  id: uuid("id").primaryKey().defaultRandom(),
  mcpServerId: uuid("mcp_server_id").notNull().references(() => mcpServers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  inputSchema: jsonb("input_schema").notNull().default({}),
  outputSchema: jsonb("output_schema").notNull().default({}),
  examples: jsonb("examples").notNull().default([]),
  riskLevel: text("risk_level").notNull().default("low"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps
}, (table) => ({
  serverSlugIdx: uniqueIndex("tools_server_slug_idx").on(table.mcpServerId, table.slug),
  serverIdx: index("tools_server_idx").on(table.mcpServerId)
}));

export const scopes = pgTable("scopes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  isSensitive: boolean("is_sensitive").notNull().default(false),
  ...timestamps
}, (table) => ({
  orgNameIdx: uniqueIndex("scopes_org_name_idx").on(table.organizationId, table.name),
  orgIdx: index("scopes_org_idx").on(table.organizationId)
}));

export const toolScopes = pgTable("tool_scopes", {
  toolId: uuid("tool_id").notNull().references(() => tools.id, { onDelete: "cascade" }),
  scopeId: uuid("scope_id").notNull().references(() => scopes.id, { onDelete: "cascade" })
}, (table) => ({
  pk: uniqueIndex("tool_scopes_tool_scope_idx").on(table.toolId, table.scopeId),
  toolIdx: index("tool_scopes_tool_idx").on(table.toolId),
  scopeIdx: index("tool_scopes_scope_idx").on(table.scopeId)
}));

export const toolMappings = pgTable("tool_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolId: uuid("tool_id").notNull().references(() => tools.id, { onDelete: "cascade" }),
  backendApiId: uuid("backend_api_id").notNull().references(() => backendApis.id, { onDelete: "restrict" }),
  backendResourceId: uuid("backend_resource_id").notNull().references(() => backendResources.id, { onDelete: "restrict" }),
  requestMapping: jsonb("request_mapping").notNull().default({}),
  responseMapping: jsonb("response_mapping").notNull().default({}),
  errorMapping: jsonb("error_mapping").notNull().default({}),
  authStrategy: text("auth_strategy").notNull().default("inherit"),
  timeoutOverrideMs: integer("timeout_override_ms"),
  retryOverride: jsonb("retry_override"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps
}, (table) => ({
  toolIdx: uniqueIndex("tool_mappings_tool_idx").on(table.toolId),
  backendApiIdx: index("tool_mappings_backend_api_idx").on(table.backendApiId),
  backendResourceIdx: index("tool_mappings_backend_resource_idx").on(table.backendResourceId)
}));

export const secrets = pgTable("secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  secretType: secretTypeEnum("secret_type").notNull().default("other"),
  storageMode: secretStorageModeEnum("storage_mode").notNull(),
  externalRef: text("external_ref"),
  encryptedValue: text("encrypted_value"),
  keyVersion: integer("key_version").notNull().default(1),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps
}, (table) => ({
  orgNameIdx: uniqueIndex("secrets_org_name_idx").on(table.organizationId, table.name),
  orgIdx: index("secrets_org_idx").on(table.organizationId)
}));

export const draftConfigStates = pgTable("draft_config_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status: draftStatusEnum("status").notNull().default("draft"),
  lastEditedBy: uuid("last_edited_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps
}, (table) => ({
  orgIdx: uniqueIndex("draft_config_states_org_idx").on(table.organizationId)
}));

export const runtimeSnapshots = pgTable("runtime_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: snapshotStatusEnum("status").notNull().default("published"),
  snapshotJson: jsonb("snapshot_json").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true })
}, (table) => ({
  orgVersionIdx: uniqueIndex("runtime_snapshots_org_version_idx").on(table.organizationId, table.version),
  orgIdx: index("runtime_snapshots_org_idx").on(table.organizationId)
}));

export const publishEvents = pgTable("publish_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  snapshotId: uuid("snapshot_id").notNull().references(() => runtimeSnapshots.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  orgIdx: index("publish_events_org_idx").on(table.organizationId),
  snapshotIdx: index("publish_events_snapshot_idx").on(table.snapshotId)
}));

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  actorType: text("actor_type").notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  orgIdx: index("audit_events_org_idx").on(table.organizationId),
  actorIdx: index("audit_events_actor_idx").on(table.actorId)
}));

export const executionLogs = pgTable("execution_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  mcpServerId: uuid("mcp_server_id").references(() => mcpServers.id, { onDelete: "set null" }),
  toolId: uuid("tool_id").references(() => tools.id, { onDelete: "set null" }),
  requestId: text("request_id").notNull(),
  traceId: text("trace_id"),
  status: text("status").notNull(),
  backendStatus: integer("backend_status"),
  latencyMs: integer("latency_ms"),
  inputPayload: jsonb("input_payload"),
  outputPayload: jsonb("output_payload"),
  errorPayload: jsonb("error_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  orgIdx: index("execution_logs_org_idx").on(table.organizationId),
  requestIdx: index("execution_logs_request_idx").on(table.requestId),
  toolIdx: index("execution_logs_tool_idx").on(table.toolId)
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  backendApis: many(backendApis),
  mcpServers: many(mcpServers),
  scopes: many(scopes),
  secrets: many(secrets),
  snapshots: many(runtimeSnapshots)
}));
