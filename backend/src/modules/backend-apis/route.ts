import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { apiEnvelopeSchema, backendApiSchema, paginatedMetaSchema } from "../../contracts/admin-api.js";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { backendApiBodySchema, backendApiListQuerySchema, backendApiUpdateSchema } from "./schemas.js";
import { backendApiService } from "./service.js";
import { serializeBackendApi } from "./serializer.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export const backendApiRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: {
      tags: ["backend-apis"],
      querystring: backendApiListQuerySchema,
      response: {
        200: apiEnvelopeSchema(z.array(backendApiSchema), paginatedMetaSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const query = backendApiListQuerySchema.parse(request.query);
    const result = await backendApiService.list(app, query);
    return ok(result.rows.map(serializeBackendApi), { pagination: result.pagination });
  });

  app.post("/", {
    schema: {
      tags: ["backend-apis"],
      body: backendApiBodySchema,
      response: {
        200: apiEnvelopeSchema(backendApiSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const body = backendApiBodySchema.parse(request.body);
    const row = await backendApiService.create(app, request.user.sub, body.organizationId, body);
    return ok(serializeBackendApi(row));
  });

  app.patch("/:id", {
    schema: {
      tags: ["backend-apis"],
      params: paramsSchema,
      body: backendApiUpdateSchema,
      response: {
        200: apiEnvelopeSchema(backendApiSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const body = backendApiUpdateSchema.parse(request.body);
    const row = await backendApiService.update(app, request.user.sub, request.user.organizationId, params.id, body);
    return ok(serializeBackendApi(row));
  });

  app.delete("/:id", {
    schema: {
      tags: ["backend-apis"],
      params: paramsSchema
    },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const row = await backendApiService.delete(app, request.user.sub, request.user.organizationId, params.id);
    return ok(serializeBackendApi(row));
  });
};
