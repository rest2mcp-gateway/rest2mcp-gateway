import type { FastifyPluginAsync } from "fastify";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { secretBodySchema, secretListQuerySchema } from "./schemas.js";
import { secretService } from "./service.js";
import { serializeSecret } from "./serializer.js";

export const secretRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", {
    schema: { tags: ["secrets"], querystring: secretListQuerySchema },
    preHandler: requireRoles(["super_admin", "admin"])
  }, async (request) => {
    const query = secretListQuerySchema.parse(request.query);
    const result = await secretService.list(app, query);
    return ok(result.rows.map(serializeSecret), { pagination: result.pagination });
  });

  app.post("/", {
    schema: { tags: ["secrets"], body: secretBodySchema },
    preHandler: requireRoles(["super_admin", "admin"])
  }, async (request) => {
    const body = secretBodySchema.parse(request.body);
    const row = await secretService.create(app, request.user.sub, body);
    return ok(serializeSecret(row));
  });
};
