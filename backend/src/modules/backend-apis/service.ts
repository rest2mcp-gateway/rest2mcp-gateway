import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { encryptSecret } from "../../lib/crypto.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { mcpServers, toolMappings, tools } from "../../db/schema.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";
import { backendApiRepository } from "./repository.js";

type JsonObject = Record<string, unknown>;

type BackendApiInput = {
  organizationId?: string | undefined;
  name?: string | undefined;
  slug?: string | undefined;
  description?: string | undefined;
  defaultBaseUrl?: string | undefined;
  authType?: "none" | "api_key" | "basic" | "bearer" | "oauth2" | undefined;
  authConfig?: Record<string, unknown> | undefined;
  apiKeyLocation?: "header" | "query" | undefined;
  apiKeyName?: string | undefined;
  apiKeyValue?: string | undefined;
  bearerToken?: string | undefined;
  basicUsername?: string | undefined;
  basicPassword?: string | undefined;
  oauth2AccessToken?: string | undefined;
  defaultTimeoutMs?: number | undefined;
  retryPolicy?: Record<string, unknown> | undefined;
  isActive?: boolean | undefined;
};

const asObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};

const normalizeNonEmpty = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const getExistingSecret = (authConfig: JsonObject, encryptedKey: string, legacyKey: string) => {
  const encrypted = normalizeNonEmpty(authConfig[encryptedKey]);
  if (encrypted) {
    return encrypted;
  }

  const legacyValue = normalizeNonEmpty(authConfig[legacyKey]);
  return legacyValue ? encryptSecret(legacyValue) : undefined;
};

const buildAuthConfig = (input: BackendApiInput, existing?: { authType: string; authConfig: unknown }): JsonObject => {
  const effectiveAuthType = input.authType ?? (existing?.authType as BackendApiInput["authType"]) ?? "none";
  const existingConfig = asObject(existing?.authConfig);

  switch (effectiveAuthType) {
    case "none":
      return {};
    case "api_key": {
      const placement = input.apiKeyLocation ?? (existingConfig.in === "query" ? "query" : existingConfig.in === "header" ? "header" : undefined);
      const name = normalizeNonEmpty(input.apiKeyName) ?? normalizeNonEmpty(existingConfig.name);
      const encryptedValue = normalizeNonEmpty(input.apiKeyValue)
        ? encryptSecret(input.apiKeyValue!)
        : getExistingSecret(existingConfig, "encryptedValue", "value");

      if (!placement || !name || !encryptedValue) {
        throw new AppError(400, "API key auth requires placement, name, and value", "backend_api_api_key_invalid");
      }

      return {
        in: placement,
        name,
        encryptedValue
      };
    }
    case "bearer": {
      const encryptedToken = normalizeNonEmpty(input.bearerToken)
        ? encryptSecret(input.bearerToken!)
        : getExistingSecret(existingConfig, "encryptedToken", "token") ??
          getExistingSecret(existingConfig, "encryptedToken", "accessToken");

      if (!encryptedToken) {
        throw new AppError(400, "Bearer auth requires a token", "backend_api_bearer_invalid");
      }

      return {
        encryptedToken
      };
    }
    case "oauth2": {
      const encryptedAccessToken = normalizeNonEmpty(input.oauth2AccessToken)
        ? encryptSecret(input.oauth2AccessToken!)
        : getExistingSecret(existingConfig, "encryptedAccessToken", "accessToken") ??
          getExistingSecret(existingConfig, "encryptedAccessToken", "token");

      if (!encryptedAccessToken) {
        throw new AppError(400, "OAuth 2.0 auth requires an access token", "backend_api_oauth2_invalid");
      }

      return {
        encryptedAccessToken
      };
    }
    case "basic": {
      const username = normalizeNonEmpty(input.basicUsername) ?? normalizeNonEmpty(existingConfig.username);
      const encryptedPassword = normalizeNonEmpty(input.basicPassword)
        ? encryptSecret(input.basicPassword!)
        : getExistingSecret(existingConfig, "encryptedPassword", "password");

      if (!username || !encryptedPassword) {
        throw new AppError(400, "Basic auth requires username and password", "backend_api_basic_invalid");
      }

      return {
        username,
        encryptedPassword
      };
    }
    default:
      return asObject(input.authConfig);
  }
};

const stripUndefined = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

const listApiDependencies = async (app: FastifyInstance, backendApiId: string) =>
  app.db
    .select({
      toolId: tools.id,
      toolName: tools.name,
      serverId: mcpServers.id,
      serverName: mcpServers.name
    })
    .from(toolMappings)
    .innerJoin(tools, eq(toolMappings.toolId, tools.id))
    .innerJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
    .where(eq(toolMappings.backendApiId, backendApiId));

const buildDependencyMessage = (
  entityLabel: string,
  references: Array<{ toolName: string; serverName: string }>
) => {
  const preview = references
    .slice(0, 3)
    .map((reference) => `${reference.toolName} (${reference.serverName})`)
    .join(", ");
  const suffix = references.length > 3 ? `, and ${references.length - 3} more` : "";
  return `Cannot delete ${entityLabel} because it is referenced by ${references.length} tool mapping${references.length === 1 ? "" : "s"}: ${preview}${suffix}.`;
};

const buildPersistedValues = (
  input: BackendApiInput,
  existing?: { authType: string; authConfig: unknown }
) =>
  stripUndefined({
    organizationId: input.organizationId,
    name: input.name,
    slug: input.slug,
    description: input.description,
    defaultBaseUrl: input.defaultBaseUrl,
    authType: input.authType ?? existing?.authType ?? "none",
    authConfig: buildAuthConfig(input, existing),
    defaultTimeoutMs: input.defaultTimeoutMs,
    retryPolicy: input.retryPolicy,
    isActive: input.isActive
  });

export const backendApiService = {
  list: backendApiRepository.list,
  async create(app: FastifyInstance, actorId: string, organizationId: string, values: BackendApiInput) {
    const persistedValues = buildPersistedValues(values);
    const createdRows = await backendApiRepository.create(app, persistedValues) as Array<{ id: string } & Record<string, unknown>>;
    const row = createdRows[0];
    if (!row) {
      throw new Error("Failed to create backend_api");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "backend_api.create",
      entityType: "backend_api",
      entityId: row.id,
      payload: { ...persistedValues, authConfig: "[redacted]" }
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "backend_api.create");
    return row;
  },
  async update(app: FastifyInstance, actorId: string, organizationId: string, id: string, values: BackendApiInput) {
    const existing = await backendApiRepository.getById(app, organizationId, id);
    if (!existing) {
      throw new AppError(404, "backend_api not found", "backend_api_not_found");
    }

    const persistedValues = buildPersistedValues(values, existing);
    const updatedRows = await backendApiRepository.update(app, id, persistedValues) as Array<{ id: string } & Record<string, unknown>>;
    const row = updatedRows[0];
    if (!row) {
      throw new AppError(404, "backend_api not found", "backend_api_not_found");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "backend_api.update",
      entityType: "backend_api",
      entityId: row.id,
      payload: { ...persistedValues, authConfig: "[redacted]" }
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "backend_api.update");
    return row;
  },
  async delete(app: FastifyInstance, actorId: string, organizationId: string, id: string) {
    const existing = await backendApiRepository.getById(app, organizationId, id);
    if (!existing) {
      throw new AppError(404, "backend_api not found", "backend_api_not_found");
    }

    const references = await listApiDependencies(app, id);
    if (references.length > 0) {
      throw new AppError(409, buildDependencyMessage("backend API", references), "backend_api_in_use", {
        references
      });
    }

    await app.db.delete(toolMappings).where(eq(toolMappings.backendApiId, id));

    const deletedRows = await backendApiRepository.delete(app, id) as Array<{ id: string } & Record<string, unknown>>;
    const row = deletedRows[0];
    if (!row) {
      throw new AppError(404, "backend_api not found", "backend_api_not_found");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "backend_api.delete",
      entityType: "backend_api",
      entityId: row.id,
      payload: { name: existing.name, slug: existing.slug }
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "backend_api.delete");
    return row;
  }
};
