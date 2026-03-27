import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { backendResourceBodySchema, backendResourceListQuerySchema, backendResourceUpdateSchema } from "./schemas.js";
import { backendResourceService } from "./service.js";
import { serializeBackendResource } from "./serializer.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export const backendResourceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: { tags: ["backend-resources"], querystring: backendResourceListQuerySchema },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const query = backendResourceListQuerySchema.parse(request.query);
    const result = await backendResourceService.list(app, request.user.organizationId, query);
    return ok(result.rows.map(serializeBackendResource), { pagination: result.pagination });
  });

  app.post("/", {
    schema: { tags: ["backend-resources"], body: backendResourceBodySchema },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const body = backendResourceBodySchema.parse(request.body);
    const row = await backendResourceService.create(app, request.user.sub, request.user.organizationId, body);
    return ok(serializeBackendResource(row));
  });

  app.patch("/:id", {
    schema: { tags: ["backend-resources"], params: paramsSchema, body: backendResourceUpdateSchema },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const body = backendResourceUpdateSchema.parse(request.body);
    const row = await backendResourceService.update(app, request.user.sub, request.user.organizationId, params.id, body);
    return ok(serializeBackendResource(row));
  });
};
