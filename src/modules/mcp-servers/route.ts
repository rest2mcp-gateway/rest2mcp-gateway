import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { mcpServerBodySchema, mcpServerListQuerySchema, mcpServerUpdateSchema } from "./schemas.js";
import { mcpServerService } from "./service.js";
import { serializeMcpServer } from "./serializer.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export const mcpServerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: { tags: ["mcp-servers"], querystring: mcpServerListQuerySchema },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const query = mcpServerListQuerySchema.parse(request.query);
    const result = await mcpServerService.list(app, query);
    return ok(result.rows.map(serializeMcpServer), { pagination: result.pagination });
  });

  app.post("/", {
    schema: { tags: ["mcp-servers"], body: mcpServerBodySchema },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const body = mcpServerBodySchema.parse(request.body);
    const row = await mcpServerService.create(app, request.user.sub, body.organizationId, body);
    return ok(serializeMcpServer(row));
  });

  app.patch("/:id", {
    schema: { tags: ["mcp-servers"], params: paramsSchema, body: mcpServerUpdateSchema },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const body = mcpServerUpdateSchema.parse(request.body);
    const row = await mcpServerService.update(app, request.user.sub, request.user.organizationId, params.id, body);
    return ok(serializeMcpServer(row));
  });

  app.delete("/:id", {
    schema: { tags: ["mcp-servers"], params: paramsSchema },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const row = await mcpServerService.delete(app, request.user.sub, request.user.organizationId, params.id);
    return ok(serializeMcpServer(row));
  });
};
