import type { FastifyPluginAsync } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { runtimeService } from "./service.js";
import {
  assertAllowedRuntimeOrigin,
  buildProtectedResourceMetadata,
  ensureTokenHasScopes,
  validateRuntimeAccessToken
} from "./auth.js";
import { env } from "../../config/env.js";

const runtimeParamsSchema = z.object({
  serverSlug: z.string().min(1)
});

export const runtimeMetadataRoutes: FastifyPluginAsync = async (app) => {
  app.get("/.well-known/oauth-protected-resource/mcp/:serverSlug", {
    schema: {
      tags: ["mcp-runtime"],
      params: runtimeParamsSchema
    }
  }, async (request) => {
    const params = runtimeParamsSchema.parse(request.params);
    const runtimeServer = await runtimeService.getServer(app, params.serverSlug);

    if (runtimeServer.server.accessMode !== "protected" || !runtimeServer.authServerConfig) {
      return {
        resource: new URL(`/mcp/${params.serverSlug}`, `${request.protocol}://${request.headers.host}`).href,
        authorization_servers: []
      };
    }

    return buildProtectedResourceMetadata(
      request,
      params.serverSlug,
      runtimeServer.authServerConfig,
      runtimeServer.server.name,
      runtimeServer.requiredScopes
    );
  });
};

export const runtimeRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/:serverSlug",
    schema: {
      tags: ["mcp-runtime"],
      params: runtimeParamsSchema
    },
    async handler(request, reply) {
      const params = runtimeParamsSchema.parse(request.params);
      const allowedOrigin = assertAllowedRuntimeOrigin(request.headers.origin, env.mcpAllowedOrigins);

      try {
        const runtimeServer = await runtimeService.getServer(app, params.serverSlug);
        const authPayload = await validateRuntimeAccessToken(
          request,
          params.serverSlug,
          runtimeServer.authServerConfig,
          {
            accessMode: runtimeServer.server.accessMode,
            audience: runtimeServer.server.audience
          }
        );

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
                authPayload.payload,
                runtimeTool.requiredScopes,
                request,
                params.serverSlug
              );
            }
          }
        }

        const server = runtimeService.createSdkServer(app, runtimeServer, authPayload);
        const transport = new StreamableHTTPServerTransport({});
        transport.onclose = () => {};

        if (allowedOrigin) {
          reply.header("access-control-allow-origin", allowedOrigin);
          reply.header("access-control-allow-credentials", "true");
          reply.header("vary", "Origin");
        }

        const originalWriteHead = reply.raw.writeHead.bind(reply.raw);
        if (allowedOrigin) {
          reply.raw.writeHead = ((...args: unknown[]) => {
            const statusCode = args[0] as number;
            const statusMessageOrHeaders = args[1];
            const headers = args[2];

            if (typeof statusMessageOrHeaders === "string") {
              return originalWriteHead(statusCode, statusMessageOrHeaders, {
                ...(headers && typeof headers === "object" ? headers : {}),
                "access-control-allow-origin": allowedOrigin,
                "access-control-allow-credentials": "true",
                vary: "Origin"
              });
            }

            return originalWriteHead(statusCode, {
              ...(statusMessageOrHeaders && typeof statusMessageOrHeaders === "object" ? statusMessageOrHeaders : {}),
              "access-control-allow-origin": allowedOrigin,
              "access-control-allow-credentials": "true",
              vary: "Origin"
            });
          }) as typeof reply.raw.writeHead;
        }

        await server.connect(transport as Parameters<typeof server.connect>[0]);
        try {
          await transport.handleRequest(
            request.raw,
            reply.raw,
            request.method === "POST" ? request.body : undefined
          );
        } finally {
          reply.raw.writeHead = originalWriteHead;
        }
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
