import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { apiEnvelopeSchema, organizationSchema, paginatedMetaSchema } from "../../contracts/admin-api.js";
import { organizationCreateSchema, organizationListQuerySchema } from "./schemas.js";
import { organizationService } from "./service.js";

export const organizationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: {
      tags: ["organizations"],
      querystring: organizationListQuerySchema,
      response: {
        200: apiEnvelopeSchema(z.array(organizationSchema), paginatedMetaSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const query = organizationListQuerySchema.parse(request.query);
    const result = await organizationService.list(app, query);
    return ok(result.rows, { pagination: result.pagination });
  });

  app.post("/", {
    schema: {
      tags: ["organizations"],
      body: organizationCreateSchema,
      response: {
        200: apiEnvelopeSchema(organizationSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin"])
  }, async (request) => {
    const body = organizationCreateSchema.parse(request.body);
    const row = await organizationService.create(app, request.user.sub, body);
    return ok(row);
  });
};
