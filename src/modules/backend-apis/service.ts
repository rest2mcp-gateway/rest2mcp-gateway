import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { encryptSecret } from "../../lib/crypto.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";
import { backendApiRepository } from "./repository.js";

type JsonObject = Record<string, unknown>;

type BackendApiInput = {
  organizationId?: string;
  name?: string;
  slug?: string;
  description?: string;
  defaultBaseUrl?: string;
  authType?: "none" | "api_key" | "basic" | "bearer" | "oauth2";
  authConfig?: Record<string, unknown>;
  apiKeyLocation?: "header" | "query";
  apiKeyName?: string;
  apiKeyValue?: string;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  oauth2AccessToken?: string;
  defaultTimeoutMs?: number;
  retryPolicy?: Record<string, unknown>;
  isActive?: boolean;
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
    const [row] = await backendApiRepository.create(app, persistedValues);

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
    const [row] = await backendApiRepository.update(app, id, persistedValues);
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
  }
};
