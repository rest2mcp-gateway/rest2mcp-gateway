import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { publishBodySchema } from "./schemas.js";
import { serializeValidationResult } from "./serializer.js";
import { configService } from "./service.js";

const organizationParamsSchema = z.object({
  organizationId: z.string().uuid()
});

export const configRoutes: FastifyPluginAsync = async (app) => {
  app.get("/validate/:organizationId", {
    schema: { tags: ["config"], params: organizationParamsSchema },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const params = organizationParamsSchema.parse(request.params);
    const issues = await configService.validate(app, params.organizationId);
    return ok(serializeValidationResult(issues));
  });

  app.get("/snapshots/:organizationId", {
    schema: { tags: ["config"], params: organizationParamsSchema },
    preHandler: requireRoles(["super_admin", "admin", "editor", "viewer"])
  }, async (request) => {
    const params = organizationParamsSchema.parse(request.params);
    const rows = await configService.listSnapshots(app, params.organizationId);
    return ok(rows);
  });

  app.post("/publish", {
    schema: { tags: ["config"], body: publishBodySchema },
    preHandler: requireRoles(["super_admin", "admin"])
  }, async (request) => {
    const body = publishBodySchema.parse(request.body);
    const result = await configService.publish(app, request.user.sub, body.organizationId, body.notes);
    return ok(result);
  });
};
