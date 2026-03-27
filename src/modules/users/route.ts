import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { userCreateSchema, userListQuerySchema, userUpdateSchema } from "./schemas.js";
import { userService } from "./service.js";
import { serializeUser } from "./serializer.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: { tags: ["users"], querystring: userListQuerySchema },
    preHandler: requireRoles(["super_admin", "admin", "viewer", "editor"])
  }, async (request) => {
    const query = userListQuerySchema.parse(request.query);
    const result = await userService.list(app, query);
    return ok(result.rows.map(serializeUser), { pagination: result.pagination });
  });

  app.post("/", {
    schema: { tags: ["users"], body: userCreateSchema },
    preHandler: requireRoles(["super_admin", "admin"])
  }, async (request) => {
    const body = userCreateSchema.parse(request.body);
    const row = await userService.create(app, request.user.sub, body);
    return ok(serializeUser(row));
  });

  app.patch("/:id", {
    schema: { tags: ["users"], params: paramsSchema, body: userUpdateSchema },
    preHandler: requireRoles(["super_admin", "admin"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const body = userUpdateSchema.parse(request.body);
    const row = await userService.update(app, request.user.sub, params.id, body);
    return ok(serializeUser(row));
  });
};
