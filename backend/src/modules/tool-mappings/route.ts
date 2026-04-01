import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { apiEnvelopeSchema, paginatedMetaSchema, toolMappingSchema } from "../../contracts/admin-api.js";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { toolMappingBodySchema, toolMappingListQuerySchema, toolMappingUpdateSchema } from "./schemas.js";
import { toolMappingService } from "./service.js";
import { serializeToolMapping } from "./serializer.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export const toolMappingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: {
      tags: ["tool-mappings"],
      querystring: toolMappingListQuerySchema,
      response: {
        200: apiEnvelopeSchema(z.array(toolMappingSchema), paginatedMetaSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const query = toolMappingListQuerySchema.parse(request.query);
    const result = await toolMappingService.list(app, query, request.user.organizationId);
    return ok(result.rows.map(serializeToolMapping), { pagination: result.pagination });
  });

  app.post("/", {
    schema: {
      tags: ["tool-mappings"],
      body: toolMappingBodySchema,
      response: {
        200: apiEnvelopeSchema(toolMappingSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const body = toolMappingBodySchema.parse(request.body);
    const row = await toolMappingService.create(app, request.user.sub, request.user.organizationId, body);
    return ok(serializeToolMapping(row));
  });

  app.patch("/:id", {
    schema: {
      tags: ["tool-mappings"],
      params: paramsSchema,
      body: toolMappingUpdateSchema,
      response: {
        200: apiEnvelopeSchema(toolMappingSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const body = toolMappingUpdateSchema.parse(request.body);
    const row = await toolMappingService.update(app, request.user.sub, request.user.organizationId, params.id, body);
    return ok(serializeToolMapping(row));
  });
};
