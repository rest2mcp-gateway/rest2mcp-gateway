import type { FastifyPluginAsync } from "fastify";
import {
  apiEnvelopeSchema,
  openApiImportExecuteResultSchema,
  openApiImportPreviewResultSchema
} from "../../contracts/admin-api.js";
import { requireRoles } from "../../lib/auth.js";
import { ok } from "../../lib/response.js";
import {
  openApiImportExecuteSchema,
  openApiImportPreviewSchema
} from "./schemas.js";
import { openApiImportService } from "./service.js";

export const openApiImportRoutes: FastifyPluginAsync = async (app) => {
  app.post("/preview", {
    schema: {
      tags: ["openapi-import"],
      body: openApiImportPreviewSchema,
      response: {
        200: apiEnvelopeSchema(openApiImportPreviewResultSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const body = openApiImportPreviewSchema.parse(request.body);
    return ok(openApiImportService.preview(body));
  });

  app.post("/execute", {
    schema: {
      tags: ["openapi-import"],
      body: openApiImportExecuteSchema,
      response: {
        200: apiEnvelopeSchema(openApiImportExecuteResultSchema)
      }
    },
    preHandler: requireRoles(["super_admin", "admin", "editor"])
  }, async (request) => {
    const body = openApiImportExecuteSchema.parse(request.body);
    const result = await openApiImportService.execute(
      app,
      request.user.sub,
      request.user.organizationId,
      body
    );
    return ok(result);
  });
};
