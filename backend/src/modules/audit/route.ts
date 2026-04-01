import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { apiEnvelopeSchema, auditEventSchema } from "../../contracts/admin-api.js";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import { auditService } from "./service.js";
import { serializeAuditEvent } from "./serializer.js";

const paramsSchema = z.object({
  organizationId: z.string().uuid()
});

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:organizationId", {
    schema: {
      tags: ["audit-events"],
      params: paramsSchema,
      response: {
        200: apiEnvelopeSchema(z.array(auditEventSchema))
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "viewer", "editor"])
  }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const rows = await auditService.listByOrganization(app, params.organizationId);
    return ok(rows.map(serializeAuditEvent));
  });
};
