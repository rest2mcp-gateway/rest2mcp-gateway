import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { runtimeService } from "./service.js";

const runtimeParamsSchema = z.object({
  organizationSlug: z.string().min(1),
  serverSlug: z.string().min(1)
});

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.unknown().optional()
});

const jsonRpcSuccess = (id: string | number | null | undefined, result: unknown) => ({
  jsonrpc: "2.0" as const,
  id: id ?? null,
  result
});

const jsonRpcError = (
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown
) => ({
  jsonrpc: "2.0" as const,
  id: id ?? null,
  error: {
    code,
    message,
    data
  }
});

export const runtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:organizationSlug/:serverSlug", {
    schema: {
      tags: ["mcp-runtime"],
      params: runtimeParamsSchema
    }
  }, async (request) => {
    const params = runtimeParamsSchema.parse(request.params);
    const initialization = await runtimeService.initialize(
      app,
      params.organizationSlug,
      params.serverSlug
    );

    return {
      ok: true,
      transport: "jsonrpc-http",
      endpoint: `/mcp/${params.organizationSlug}/${params.serverSlug}`,
      server: initialization.serverInfo
    };
  });

  app.post("/:organizationSlug/:serverSlug", {
    schema: {
      tags: ["mcp-runtime"],
      params: runtimeParamsSchema,
      body: jsonRpcRequestSchema
    }
  }, async (request, reply) => {
    const params = runtimeParamsSchema.parse(request.params);
    const body = jsonRpcRequestSchema.parse(request.body);

    try {
      switch (body.method) {
        case "initialize":
          return jsonRpcSuccess(
            body.id,
            await runtimeService.initialize(app, params.organizationSlug, params.serverSlug)
          );
        case "ping":
        case "notifications/initialized":
          return jsonRpcSuccess(body.id, {});
        case "tools/list":
          return jsonRpcSuccess(
            body.id,
            await runtimeService.listTools(app, params.organizationSlug, params.serverSlug)
          );
        case "tools/call": {
          const callParams = z.object({
            name: z.string().min(1),
            arguments: z.unknown().optional()
          }).parse(body.params);

          return jsonRpcSuccess(
            body.id,
            await runtimeService.callTool(
              app,
              params.organizationSlug,
              params.serverSlug,
              callParams.name,
              callParams.arguments
            )
          );
        }
        default:
          reply.code(200);
          return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`);
      }
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
          details?: unknown;
        };
        reply.code(200);
        return jsonRpcError(body.id, -32000, typed.message, {
          code: typed.code,
          statusCode: typed.statusCode,
          details: typed.details
        });
      }

      reply.code(200);
      return jsonRpcError(
        body.id,
        -32603,
        error instanceof Error ? error.message : "Internal MCP runtime error"
      );
    }
  });
};
