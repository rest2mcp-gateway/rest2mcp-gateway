import type { FastifyPluginAsync } from "fastify";
import { apiEnvelopeSchema, authServerConfigSchema as contractAuthServerConfigSchema } from "../../contracts/admin-api.js";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { authServerConfigSchema } from "./schemas.js";
import { securityService } from "./service.js";

export const securityRoutes: FastifyPluginAsync = async (app) => {
  app.get("/auth-server", {
    schema: {
      tags: ["security"],
      response: {
        200: apiEnvelopeSchema(contractAuthServerConfigSchema.nullable())
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const row = await securityService.getAuthServerConfig(app, request.user.organizationId);
    return ok(row ?? null);
  });

  app.put("/auth-server", {
    schema: {
      tags: ["security"],
      body: authServerConfigSchema,
      response: {
        200: apiEnvelopeSchema(contractAuthServerConfigSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin"])
  }, async (request) => {
    const body = authServerConfigSchema.parse(request.body);
    const row = await securityService.upsertAuthServerConfig(
      app,
      request.user.sub,
      request.user.organizationId,
      body
    );
    return ok(row);
  });
};
