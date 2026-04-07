import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  type ZodTypeProvider,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler
} from "fastify-type-provider-zod";
import { env } from "./config/env.js";
import { formatCompletedRequestLog, formatIncomingRequestLog, loggerConfig } from "./lib/logger.js";
import { errorHandler } from "./lib/errors.js";
import { registerDb } from "./db/client.js";
import { getOrCreateJwtSecret } from "./lib/jwt-secret.js";
import { bootstrapLocalAdmin } from "./modules/auth/bootstrap.js";
import { authRoutes } from "./modules/auth/route.js";
import { organizationRoutes } from "./modules/organizations/route.js";
import { userRoutes } from "./modules/users/route.js";
import { backendApiRoutes } from "./modules/backend-apis/route.js";
import { backendResourceRoutes } from "./modules/backend-resources/route.js";
import { mcpServerRoutes } from "./modules/mcp-servers/route.js";
import { toolRoutes } from "./modules/tools/route.js";
import { scopeRoutes } from "./modules/scopes/route.js";
import { toolMappingRoutes } from "./modules/tool-mappings/route.js";
import { secretRoutes } from "./modules/secrets/route.js";
import { configRoutes } from "./modules/config/route.js";
import { auditRoutes } from "./modules/audit/route.js";
import { executionLogRoutes } from "./modules/execution-logs/route.js";
import { frontendRoutes } from "./modules/frontend/route.js";
import { runtimeMetadataRoutes, runtimeRoutes } from "./modules/runtime/route.js";
import { openApiImportRoutes } from "./modules/openapi-import/route.js";
import { securityRoutes } from "./modules/security/route.js";

export const buildApp = async () => {
  const app = Fastify({
    logger: loggerConfig,
    disableRequestLogging: true,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false
      }
    }
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  app.addHook("onRequest", async (request) => {
    request.startedAt = Date.now();
    app.log.info(formatIncomingRequestLog(request));
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAt = request.startedAt ?? Date.now();
    app.log.info(formatCompletedRequestLog(request, reply.statusCode, Date.now() - startedAt));
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(registerDb);
  const jwtSecret = await getOrCreateJwtSecret(app);
  await app.register(jwt, { secret: jwtSecret });
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "REST to MCP Admin API",
        version: "0.1.0"
      },
      servers: [{ url: "/api/admin/v1" }]
    },
    transform: jsonSchemaTransform
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", async () => ({ status: "ok" }));

  await bootstrapLocalAdmin(app);

  await app.register(async (adminApp) => {
    await adminApp.register(authRoutes, { prefix: "/auth" });
    await adminApp.register(organizationRoutes, { prefix: "/organizations" });
    await adminApp.register(userRoutes, { prefix: "/users" });
    await adminApp.register(backendApiRoutes, { prefix: "/backend-apis" });
    await adminApp.register(openApiImportRoutes, { prefix: "/openapi-import" });
    await adminApp.register(backendResourceRoutes, { prefix: "/backend-resources" });
    await adminApp.register(mcpServerRoutes, { prefix: "/mcp-servers" });
    await adminApp.register(toolRoutes, { prefix: "/tools" });
    await adminApp.register(scopeRoutes, { prefix: "/scopes" });
    await adminApp.register(toolMappingRoutes, { prefix: "/tool-mappings" });
    await adminApp.register(secretRoutes, { prefix: "/secrets" });
    await adminApp.register(securityRoutes, { prefix: "/security" });
    await adminApp.register(configRoutes, { prefix: "/config" });
    await adminApp.register(auditRoutes, { prefix: "/audit-events" });
    await adminApp.register(executionLogRoutes, { prefix: "/execution-logs" });
  }, { prefix: "/api/admin/v1" });

  await app.register(runtimeMetadataRoutes);
  await app.register(runtimeRoutes, { prefix: "/mcp" });
  await app.register(frontendRoutes);

  return app;
};
