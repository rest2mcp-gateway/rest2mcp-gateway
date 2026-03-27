import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { executionLogService } from "./service.js";
import { serializeExecutionLog } from "./serializer.js";

const paramsSchema = z.object({
  organizationId: z.string().uuid()
});

export const executionLogRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:organizationId", {
    schema: { tags: ["execution-logs"], params: paramsSchema },
    preHandler: requireRoles(["super_admin", "admin", "viewer", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const rows = await executionLogService.listByOrganization(app, params.organizationId);
    return ok(rows.map(serializeExecutionLog));
  });
};
