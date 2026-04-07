import test from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "./helpers/runtime-app.js";
import { adminRequest, loginAsBootstrapAdmin } from "./helpers/workflows.js";

type AdminSession = Awaited<ReturnType<typeof loginAsBootstrapAdmin>>;

const createMcpServer = async (app: FastifyInstance, session: AdminSession) => {
  const response = await adminRequest(app, session, {
    method: "POST",
    url: "/api/admin/v1/mcp-servers",
    payload: {
      organizationId: session.organizationId,
      name: "Imported API Server",
      slug: "imported-api-server",
      version: "1.0.0",
      title: "Imported API Server",
      authMode: "local",
      accessMode: "public",
      isActive: true
    }
  });

  assert.equal(response.response.statusCode, 200, response.response.body);
  return response.body.data;
};

const previewImport = async (
  app: FastifyInstance,
  session: AdminSession,
  payload: {
    name: string;
    slug: string;
    description?: string;
    defaultBaseUrl: string;
    specText: string;
    targetMcpServerId?: string;
  }
) =>
  adminRequest(app, session, {
    method: "POST",
    url: "/api/admin/v1/openapi-import/preview",
    payload
  });

const executeImport = async (
  app: FastifyInstance,
  session: AdminSession,
  payload: {
    name: string;
    slug: string;
    description?: string;
    defaultBaseUrl: string;
    specText: string;
    targetMcpServerId?: string;
    operations: Array<{
      operationKey: string;
      exposeAsTool: boolean;
    }>;
  }
) =>
  adminRequest(app, session, {
    method: "POST",
    url: "/api/admin/v1/openapi-import/execute",
    payload
  });

test("requires a target MCP server when selected operations are exposed as tools", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const specText = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Widgets" },
      paths: {
        "/widgets": {
          get: {
            operationId: "listWidgets",
            responses: {
              "200": { description: "ok" }
            }
          }
        }
      }
    });

    const result = await executeImport(handle.app, session, {
      name: "Widgets",
      slug: "widgets",
      defaultBaseUrl: "https://widgets.example.test",
      specText,
      operations: [{ operationKey: "GET /widgets", exposeAsTool: true }]
    });

    assert.equal(result.response.statusCode, 400, result.response.body);
    assert.equal(result.body.error.code, "missing_target_mcp_server_id");
  } finally {
    await handle.close();
  }
});

test("imports backend resources without creating tools when all operations are not exposed", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const specText = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Widgets" },
      paths: {
        "/widgets": {
          get: {
            operationId: "listWidgets",
            responses: {
              "200": { description: "ok" }
            }
          }
        },
        "/widgets/{widgetId}": {
          delete: {
            operationId: "deleteWidget",
            parameters: [
              {
                name: "widgetId",
                in: "path",
                required: true,
                schema: { type: "string" }
              }
            ],
            responses: {
              "204": { description: "deleted" }
            }
          }
        }
      }
    });

    const result = await executeImport(handle.app, session, {
      name: "Widgets",
      slug: "widgets-no-tools",
      defaultBaseUrl: "https://widgets.example.test",
      specText,
      operations: [
        { operationKey: "GET /widgets", exposeAsTool: false },
        { operationKey: "DELETE /widgets/{widgetId}", exposeAsTool: false }
      ]
    });

    assert.equal(result.response.statusCode, 200, result.response.body);
    assert.equal(result.body.data.importedResourceCount, 2);
    assert.equal(result.body.data.importedToolCount, 0);

    const tools = await adminRequest(handle.app, session, {
      method: "GET",
      url: "/api/admin/v1/tools?page=1&pageSize=50"
    });
    assert.equal(tools.response.statusCode, 200, tools.response.body);
    assert.deepEqual(tools.body.data, []);
  } finally {
    await handle.close();
  }
});

test("deduplicates tool identifiers when multiple imported operations collide within the same batch", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const mcpServer = await createMcpServer(handle.app, session);
    const specText = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Collision API" },
      paths: {
        "/widgets": {
          get: {
            operationId: "manageWidget",
            summary: "Manage widget",
            responses: {
              "200": { description: "ok" }
            }
          },
          post: {
            operationId: "manageWidget",
            summary: "Manage widget",
            responses: {
              "201": { description: "created" }
            }
          }
        }
      }
    });

    const result = await executeImport(handle.app, session, {
      name: "Collision API",
      slug: "collision-api",
      defaultBaseUrl: "https://widgets.example.test",
      targetMcpServerId: mcpServer.id,
      specText,
      operations: [
        { operationKey: "GET /widgets", exposeAsTool: true },
        { operationKey: "POST /widgets", exposeAsTool: true }
      ]
    });

    assert.equal(result.response.statusCode, 200, result.response.body);
    assert.equal(result.body.data.importedToolCount, 2);

    const tools = await adminRequest(handle.app, session, {
      method: "GET",
      url: `/api/admin/v1/tools?mcpServerId=${mcpServer.id}`
    });
    assert.equal(tools.response.statusCode, 200, tools.response.body);
    assert.deepEqual(
      tools.body.data.map((tool: { name: string; slug: string }) => ({
        name: tool.name,
        slug: tool.slug
      })),
      [
        { name: "managewidget", slug: "managewidget" },
        { name: "managewidget_2", slug: "managewidget-2" }
      ]
    );
  } finally {
    await handle.close();
  }
});

test("builds fallback identifiers and null body templates for operations without operationId or object request bodies", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const preview = await previewImport(handle.app, session, {
      name: "Fallback Widgets Import",
      slug: "fallback-widgets-import",
      defaultBaseUrl: "https://widgets.example.test",
      specText: JSON.stringify({
        openapi: "3.0.0",
        info: {
          title: "Fallback Widgets"
        },
        paths: {
          "/widgets/bulk": {
            post: {
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: { type: "string" }
                    }
                  }
                }
              },
              responses: {
                "202": {
                  description: "accepted"
                }
              }
            }
          }
        }
      })
    });

    assert.equal(preview.response.statusCode, 200, preview.response.body);
    assert.equal(preview.body.data.backendApi.name, "Fallback Widgets Import");
    assert.equal(preview.body.data.backendApi.slug, "fallback-widgets-import");
    assert.deepEqual(preview.body.data.operations[0], {
      operationKey: "POST /widgets/bulk",
      operationId: "post__widgets_bulk",
      method: "POST",
      path: "/widgets/bulk",
      summary: "Post Widgets Bulk",
      description: "Post Widgets Bulk",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      },
      responseSchema: {},
      pathTemplate: "/widgets/bulk",
      bodyTemplate: null,
      requestSchema: {
        type: "array",
        items: { type: "string" }
      },
      exposable: true,
      exposureIssues: [],
      suggestedToolName: "post_widgets_bulk",
      suggestedToolSlug: "post-widgets-bulk",
      suggestedToolTitle: "Post Widgets Bulk"
    });
  } finally {
    await handle.close();
  }
});
