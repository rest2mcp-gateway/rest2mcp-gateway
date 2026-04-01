import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { apiEnvelopeSchema, paginatedMetaSchema, secretSchema } from "../../contracts/admin-api.js";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { secretBodySchema, secretListQuerySchema } from "./schemas.js";
import { secretService } from "./service.js";
import { serializeSecret } from "./serializer.js";

export const secretRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: {
      tags: ["secrets"],
      querystring: secretListQuerySchema,
      response: {
        200: apiEnvelopeSchema(z.array(secretSchema), paginatedMetaSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin"])
  }, async (request) => {
    const query = secretListQuerySchema.parse(request.query);
    const result = await secretService.list(app, query);
    return ok(result.rows.map(serializeSecret), { pagination: result.pagination });
  });

  app.post("/", {
    schema: {
      tags: ["secrets"],
      body: secretBodySchema,
      response: {
        200: apiEnvelopeSchema(secretSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin"])
  }, async (request) => {
    const body = secretBodySchema.parse(request.body);
    const row = await secretService.create(app, request.user.sub, body);
    return ok(serializeSecret(row));
  });
};
