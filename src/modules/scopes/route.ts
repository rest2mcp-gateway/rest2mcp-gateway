import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { scopeBodySchema, scopeListQuerySchema, scopeUpdateSchema } from "./schemas.js";
import { scopeService } from "./service.js";
import { serializeScope } from "./serializer.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export const scopeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: { tags: ["scopes"], querystring: scopeListQuerySchema },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const query = scopeListQuerySchema.parse(request.query);
    const result = await scopeService.list(app, query);
    return ok(result.rows.map(serializeScope), { pagination: result.pagination });
  });

  app.post("/", {
    schema: { tags: ["scopes"], body: scopeBodySchema },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const body = scopeBodySchema.parse(request.body);
    const row = await scopeService.create(app, request.user.sub, body.organizationId, body);
    return ok(serializeScope(row));
  });

  app.patch("/:id", {
    schema: { tags: ["scopes"], params: paramsSchema, body: scopeUpdateSchema },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const body = scopeUpdateSchema.parse(request.body);
    const row = await scopeService.update(app, request.user.sub, request.user.organizationId, params.id, body);
    return ok(serializeScope(row));
  });

  app.delete("/:id", {
    schema: { tags: ["scopes"], params: paramsSchema },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const row = await scopeService.delete(app, request.user.sub, request.user.organizationId, params.id);
    return ok(serializeScope(row));
  });
};
