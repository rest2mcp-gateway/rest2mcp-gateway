import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { authServerConfigs } from "../../db/schema.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { encryptSecret } from "../../lib/crypto.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";

type AuthServerConfigInput = {
  issuer: string;
  jwksUri: string;
  tokenEndpoint?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
};

const normalizeNonEmpty = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const serializeAuthServerConfig = (row: Record<string, unknown>) => ({
  ...row,
  tokenEndpoint: typeof row.tokenEndpoint === "string" ? row.tokenEndpoint : null,
  clientId: typeof row.clientId === "string" ? row.clientId : null,
  clientSecret: null,
  hasClientSecret: typeof row.encryptedClientSecret === "string" && row.encryptedClientSecret.length > 0,
  encryptedClientSecret: undefined
});

export const securityService = {
  async getStoredAuthServerConfig(app: FastifyInstance, organizationId: string) {
    return app.db.query.authServerConfigs.findFirst({
      where: eq(authServerConfigs.organizationId, organizationId)
    });
  },

  async getAuthServerConfig(app: FastifyInstance, organizationId: string) {
    const row = await this.getStoredAuthServerConfig(app, organizationId);
    return row ? serializeAuthServerConfig(row) : null;
  },

  async upsertAuthServerConfig(
    app: FastifyInstance,
    actorId: string,
    organizationId: string,
    values: AuthServerConfigInput
  ) {
    const existing = await this.getStoredAuthServerConfig(app, organizationId);
    const persistedValues = {
      issuer: values.issuer,
      jwksUri: values.jwksUri,
      tokenEndpoint: normalizeNonEmpty(values.tokenEndpoint) ?? null,
      clientId: normalizeNonEmpty(values.clientId) ?? null,
      encryptedClientSecret:
        normalizeNonEmpty(values.clientSecret)
          ? encryptSecret(values.clientSecret!)
          : existing?.encryptedClientSecret ?? null
    };

    if (existing) {
      const [row] = await app.db
        .update(authServerConfigs)
        .set(persistedValues)
        .where(and(
          eq(authServerConfigs.organizationId, organizationId),
          eq(authServerConfigs.id, existing.id)
        ))
        .returning();

      if (!row) {
        throw new Error("Failed to update auth server config");
      }

      await writeAuditEvent(app, {
        organizationId,
        actorType: "user",
        actorId,
        action: "auth_server_config.update",
        entityType: "auth_server_config",
        entityId: row.id,
        payload: { ...persistedValues, encryptedClientSecret: "[redacted]" }
      });

      await maybeAutoPublishDraft(app, actorId, organizationId, "auth_server_config.update");
      return serializeAuthServerConfig(row);
    }

    const [row] = await app.db.insert(authServerConfigs).values({
      organizationId,
      ...persistedValues
    }).returning();

    if (!row) {
      throw new Error("Failed to create auth server config");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "auth_server_config.create",
      entityType: "auth_server_config",
      entityId: row.id,
      payload: { ...persistedValues, encryptedClientSecret: "[redacted]" }
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "auth_server_config.create");
    return serializeAuthServerConfig(row);
  }
};
