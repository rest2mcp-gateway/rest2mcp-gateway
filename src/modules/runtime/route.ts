import type { FastifyPluginAsync } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { runtimeService } from "./service.js";
import {
  buildProtectedResourceMetadata,
  ensureTokenHasScopes,
  validateRuntimeAccessToken
} from "./auth.js";

const runtimeParamsSchema = z.object({
  organizationSlug: z.string().min(1),
  serverSlug: z.string().min(1)
});

export const runtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/.well-known/oauth-protected-resource/:organizationSlug/:serverSlug", {
    schema: {
      tags: ["mcp-runtime"],
      params: runtimeParamsSchema
    }
  }, async (request) => {
    const params = runtimeParamsSchema.parse(request.params);
    const runtimeServer = await runtimeService.getServer(app, params.organizationSlug, params.serverSlug);

    if (runtimeServer.server.accessMode !== "protected" || !runtimeServer.authServerConfig) {
      return {
        resource: new URL(`/mcp/${params.organizationSlug}/${params.serverSlug}`, `${request.protocol}://${request.headers.host}`).href,
        authorization_servers: []
      };
    }

      return buildProtectedResourceMetadata(
      request,
      params.organizationSlug,
      params.serverSlug,
      runtimeServer.authServerConfig,
      runtimeServer.server.title,
      runtimeServer.requiredScopes
    );
  });

  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/:organizationSlug/:serverSlug",
    schema: {
      tags: ["mcp-runtime"],
      params: runtimeParamsSchema
    },
    async handler(request, reply) {
      const params = runtimeParamsSchema.parse(request.params);

      try {
        const runtimeServer = await runtimeService.getServer(app, params.organizationSlug, params.serverSlug);
        const authPayload = await validateRuntimeAccessToken(
          request,
          params.organizationSlug,
          params.serverSlug,
          runtimeServer.authServerConfig,
          {
            accessMode: runtimeServer.server.accessMode,
            audience: runtimeServer.server.audience
          }
        );

        if (authPayload) {
          (request.raw as typeof request.raw & { auth?: unknown }).auth = authPayload;
        }

        const runtimeRequest =
          request.body && typeof request.body === "object" && !Array.isArray(request.body)
            ? request.body as Record<string, unknown>
            : null;
        if (authPayload && runtimeRequest?.method === "tools/call") {
          const paramsObject =
            runtimeRequest.params && typeof runtimeRequest.params === "object" && !Array.isArray(runtimeRequest.params)
              ? runtimeRequest.params as Record<string, unknown>
              : {};
          const toolName = typeof paramsObject.name === "string" ? paramsObject.name : null;
          if (toolName) {
            const runtimeTool = runtimeServer.toolsByName.get(toolName);
            if (runtimeTool) {
              ensureTokenHasScopes(
                authPayload,
                runtimeTool.requiredScopes,
                request,
                params.organizationSlug,
                params.serverSlug
              );
            }
          }
        }

        const server = runtimeService.createSdkServer(app, runtimeServer);
        const transport = new StreamableHTTPServerTransport({});
        transport.onclose = () => {};

        await server.connect(transport as Parameters<typeof server.connect>[0]);
        await transport.handleRequest(
          request.raw,
          reply.raw,
          request.method === "POST" ? request.body : undefined
        );
        await server.close();
        return reply;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "statusCode" in error &&
          "message" in error &&
          "code" in error
        ) {
          const typed = error as {
            statusCode: number;
            message: string;
            code: string;
            details?: Record<string, unknown>;
          };
          const wwwAuthenticate = typeof typed.details?.wwwAuthenticate === "string" ? typed.details.wwwAuthenticate : null;
          if (wwwAuthenticate) {
            reply.header("www-authenticate", wwwAuthenticate);
          }
          return reply.code(typed.statusCode).send({
            error: {
              code: typed.code,
              message: typed.message
            }
          });
        }

        return reply.code(500).send({
          error: {
            code: "runtime_internal_error",
            message: error instanceof Error ? error.message : "Internal MCP runtime error"
          }
        });
      }
    }
  });
};
