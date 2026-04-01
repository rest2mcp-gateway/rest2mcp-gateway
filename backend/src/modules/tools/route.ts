import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { apiEnvelopeSchema, paginatedMetaSchema, toolSchema } from "../../contracts/admin-api.js";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { toolBodySchema, toolListQuerySchema, toolUpdateSchema } from "./schemas.js";
import { toolService } from "./service.js";
import { serializeTool } from "./serializer.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export const toolRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: {
      tags: ["tools"],
      querystring: toolListQuerySchema,
      response: {
        200: apiEnvelopeSchema(z.array(toolSchema), paginatedMetaSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const query = toolListQuerySchema.parse(request.query);
    const result = await toolService.list(app, query, request.user.organizationId);
    return ok(result.rows.map(serializeTool), { pagination: result.pagination });
  });

  app.get("/:id", {
    schema: {
      tags: ["tools"],
      params: paramsSchema,
      response: {
        200: apiEnvelopeSchema(toolSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const row = await toolService.get(app, request.user.organizationId, params.id);
    return ok(serializeTool(row));
  });

  app.post("/", {
    schema: {
      tags: ["tools"],
      body: toolBodySchema,
      response: {
        200: apiEnvelopeSchema(toolSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const body = toolBodySchema.parse(request.body);
    const row = await toolService.create(app, request.user.sub, request.user.organizationId, body);
    return ok(serializeTool(row));
  });

  app.patch("/:id", {
    schema: {
      tags: ["tools"],
      params: paramsSchema,
      body: toolUpdateSchema,
      response: {
        200: apiEnvelopeSchema(toolSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const body = toolUpdateSchema.parse(request.body);
    const row = await toolService.update(app, request.user.sub, request.user.organizationId, params.id, body);
    return ok(serializeTool(row));
  });

  app.delete("/:id", {
    schema: {
      tags: ["tools"],
      params: paramsSchema
    },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const row = await toolService.delete(app, request.user.sub, request.user.organizationId, params.id);
    return ok(serializeTool(row));
  });
};
