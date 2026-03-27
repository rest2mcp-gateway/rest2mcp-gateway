import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { authServerConfigs } from "../../db/schema.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";

type AuthServerConfigInput = {
  issuer: string;
  jwksUri: string;
  authorizationServerMetadataUrl?: string;
};

export const securityService = {
  async getAuthServerConfig(app: FastifyInstance, organizationId: string) {
    return app.db.query.authServerConfigs.findFirst({
      where: eq(authServerConfigs.organizationId, organizationId)
    });
  },

  async upsertAuthServerConfig(
    app: FastifyInstance,
    actorId: string,
    organizationId: string,
    values: AuthServerConfigInput
  ) {
    const existing = await this.getAuthServerConfig(app, organizationId);

    if (existing) {
      const [row] = await app.db
        .update(authServerConfigs)
        .set(values)
        .where(and(
          eq(authServerConfigs.organizationId, organizationId),
          eq(authServerConfigs.id, existing.id)
        ))
        .returning();

      await writeAuditEvent(app, {
        organizationId,
        actorType: "user",
        actorId,
        action: "auth_server_config.update",
        entityType: "auth_server_config",
        entityId: row.id,
        payload: values
      });

      await maybeAutoPublishDraft(app, actorId, organizationId, "auth_server_config.update");
      return row;
    }

    const [row] = await app.db.insert(authServerConfigs).values({
      organizationId,
      ...values
    }).returning();

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "auth_server_config.create",
      entityType: "auth_server_config",
      entityId: row.id,
      payload: values
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "auth_server_config.create");
    return row;
  }
};
