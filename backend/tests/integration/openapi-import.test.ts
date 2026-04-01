import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "./helpers/runtime-app.js";
import { adminRequest, loginAsBootstrapAdmin } from "./helpers/workflows.js";

type AdminSession = Awaited<ReturnType<typeof loginAsBootstrapAdmin>>;

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const openApiFixturesDir = path.join(currentDirPath, "fixtures", "openapi");

const readFixture = async (name: string) => readFile(path.join(openApiFixturesDir, name), "utf8");

const createMcpServer = async (
  app: FastifyInstance,
  session: AdminSession,
  overrides: Partial<{
    name: string;
    slug: string;
    title: string;
  }> = {}
) => {
  const response = await adminRequest(app, session, {
    method: "POST",
    url: "/api/admin/v1/mcp-servers",
    payload: {
      organizationId: session.organizationId,
      name: overrides.name ?? "Imported API Server",
      slug: overrides.slug ?? "imported-api-server",
      version: "1.0.0",
      title: overrides.title ?? "Imported API Server",
      authMode: "local",
      accessMode: "public",
      isActive: true
    }
  });

  assert.equal(response.response.statusCode, 200, response.response.body);
  return response.body.data;
};

const listBackendResources = async (app: FastifyInstance, session: AdminSession, backendApiId: string) => {
  const response = await adminRequest(app, session, {
    method: "GET",
    url: `/api/admin/v1/backend-resources?backendApiId=${backendApiId}`
  });

  assert.equal(response.response.statusCode, 200, response.response.body);
  return response.body.data;
};

const listTools = async (app: FastifyInstance, session: AdminSession, mcpServerId: string) => {
  const response = await adminRequest(app, session, {
    method: "GET",
    url: `/api/admin/v1/tools?mcpServerId=${mcpServerId}`
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

test("previews a YAML OpenAPI fixture and resolves refs plus path parameters", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const specText = await readFixture("json-placeholder.yaml");

    const result = await previewImport(handle.app, session, {
      name: "JSON Placeholder Import",
      slug: "json-placeholder-import",
      defaultBaseUrl: "https://jsonplaceholder.typicode.com",
      specText
    });

    assert.equal(result.response.statusCode, 200, result.response.body);
    assert.equal(result.body.data.backendApi.name, "JSON Placeholder Import");
    assert.equal(result.body.data.backendApi.slug, "json-placeholder-import");
    assert.equal(result.body.data.operations.length, 2);

    const listPosts = result.body.data.operations.find((operation: { operationKey: string }) => operation.operationKey === "GET /posts");
    assert.ok(listPosts);
    assert.equal(listPosts.exposable, true);
    assert.equal(listPosts.pathTemplate, "/posts");
    assert.equal(listPosts.bodyTemplate, null);
    assert.deepEqual(listPosts.responseSchema, {
      type: "array",
      items: {
        type: "object",
        required: ["id", "userId", "title", "completed"],
        properties: {
          id: { type: "integer" },
          userId: { type: "integer" },
          title: { type: "string" },
          completed: { type: "string" }
        }
      }
    });

    const getPost = result.body.data.operations.find((operation: { operationKey: string }) => operation.operationKey === "GET /posts/{id}");
    assert.ok(getPost);
    assert.equal(getPost.exposable, true);
    assert.equal(getPost.pathTemplate, "/posts/{{id}}");
    assert.deepEqual(getPost.inputSchema, {
      type: "object",
      properties: {
        id: {
          type: "integer",
          format: "int64",
          description: "The user id."
        }
      },
      required: ["id"],
      additionalProperties: false
    });
    assert.deepEqual(getPost.responseSchema, {
      type: "object",
      required: ["id", "userId", "title", "completed"],
      properties: {
        id: { type: "integer" },
        userId: { type: "integer" },
        title: { type: "string" },
        completed: { type: "string" }
      }
    });
  } finally {
    await handle.close();
  }
});

test("executes import from a JSON OpenAPI fixture and creates resources plus tools", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const specText = await readFixture("widget-management.json");
    const mcpServer = await createMcpServer(handle.app, session);

    const result = await executeImport(handle.app, session, {
      name: "Widget Management",
      slug: "widget-management",
      description: "Imported from JSON fixture",
      defaultBaseUrl: "https://widgets.example.test",
      targetMcpServerId: mcpServer.id,
      specText,
      operations: [
        { operationKey: "POST /widgets", exposeAsTool: true },
        { operationKey: "PUT /widgets/{widgetId}", exposeAsTool: true }
      ]
    });

    assert.equal(result.response.statusCode, 200, result.response.body);
    assert.equal(result.body.data.importedResourceCount, 2);
    assert.equal(result.body.data.importedToolCount, 2);

    const backendApiId = result.body.data.backendApi.id;
    const resources = await listBackendResources(handle.app, session, backendApiId);
    assert.equal(resources.length, 2);

    const createWidgetResource = resources.find((resource: { operationId: string }) => resource.operationId === "createWidget");
    assert.ok(createWidgetResource);
    assert.equal(createWidgetResource.httpMethod, "POST");
    assert.equal(createWidgetResource.pathTemplate, "/widgets");
    assert.equal(
      createWidgetResource.bodyTemplate,
      "{\n  \"name\": \"{{name}}\",\n  \"count\": {{count}},\n  \"tags\": {{tags}},\n  \"metadata\": {{metadata}}\n}"
    );
    assert.deepEqual(createWidgetResource.requestSchema, {
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "integer" },
        tags: {
          type: "array",
          items: { type: "string" }
        },
        metadata: {
          type: "object",
          properties: {
            active: { type: "boolean" }
          }
        }
      },
      required: ["name", "tags"]
    });

    const updateWidgetResource = resources.find((resource: { operationId: string }) => resource.operationId === "updateWidget");
    assert.ok(updateWidgetResource);
    assert.equal(updateWidgetResource.pathTemplate, "/widgets/{{widgetId}}");
    assert.equal(
      updateWidgetResource.bodyTemplate,
      "{\n  \"name\": \"{{name}}\",\n  \"count\": {{count}}\n}"
    );

    const tools = await listTools(handle.app, session, mcpServer.id);
    assert.equal(tools.length, 2);

    const createWidgetTool = tools.find((tool: { name: string }) => tool.name === "createwidget");
    assert.ok(createWidgetTool);
    assert.equal(createWidgetTool.mapping.authStrategy, "inherit");
    assert.ok(createWidgetTool.mapping.backendResourceId);

    const updateWidgetTool = tools.find((tool: { name: string }) => tool.name === "updatewidget");
    assert.ok(updateWidgetTool);
    assert.equal(updateWidgetTool.mapping.authStrategy, "inherit");
    assert.ok(updateWidgetTool.mapping.backendResourceId);
  } finally {
    await handle.close();
  }
});

test("flags unsupported query and header parameters during preview and rejects tool exposure", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const specText = await readFixture("mixed-parameters.yaml");
    const mcpServer = await createMcpServer(handle.app, session);

    const preview = await previewImport(handle.app, session, {
      name: "Mixed Parameters",
      slug: "mixed-parameters",
      defaultBaseUrl: "https://search.example.test",
      targetMcpServerId: mcpServer.id,
      specText
    });

    assert.equal(preview.response.statusCode, 200, preview.response.body);
    assert.equal(preview.body.data.operations.length, 1);
    assert.equal(preview.body.data.operations[0].operationKey, "GET /search");
    assert.equal(preview.body.data.operations[0].exposable, false);
    assert.deepEqual(preview.body.data.operations[0].exposureIssues, [
      "Query/header/cookie parameters are not auto-exposed yet"
    ]);

    const execute = await executeImport(handle.app, session, {
      name: "Mixed Parameters",
      slug: "mixed-parameters-exec",
      defaultBaseUrl: "https://search.example.test",
      targetMcpServerId: mcpServer.id,
      specText,
      operations: [{ operationKey: "GET /search", exposeAsTool: true }]
    });

    assert.equal(execute.response.statusCode, 400, execute.response.body);
    assert.equal(execute.body.error.code, "openapi_unsupported_tool_exposure");
    assert.equal(execute.body.error.message, "One or more selected operations cannot be exposed as tools yet");
  } finally {
    await handle.close();
  }
});

test("deduplicates imported tool identifiers when the target MCP server already has a collision", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const mcpServer = await createMcpServer(handle.app, session, {
      name: "Collision Server",
      slug: "collision-server",
      title: "Collision Server"
    });
    const collisionSpec = await readFixture("collision-get-post.yaml");

    const existingTool = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/tools",
      payload: {
        mcpServerId: mcpServer.id,
        name: "getpost",
        slug: "getpost",
        title: "Existing Get Post",
        description: "Pre-existing tool to force identifier suffixes",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" }
          },
          required: ["id"]
        },
        outputSchema: {
          type: "object"
        },
        examples: [],
        riskLevel: "low",
        isActive: true,
        scopeIds: []
      }
    });
    assert.equal(existingTool.response.statusCode, 200, existingTool.response.body);

    const execute = await executeImport(handle.app, session, {
      name: "Collision Import",
      slug: "collision-import",
      defaultBaseUrl: "https://collision.example.test",
      targetMcpServerId: mcpServer.id,
      specText: collisionSpec,
      operations: [{ operationKey: "GET /posts/{id}", exposeAsTool: true }]
    });

    assert.equal(execute.response.statusCode, 200, execute.response.body);
    assert.equal(execute.body.data.importedToolCount, 1);

    const tools = await listTools(handle.app, session, mcpServer.id);
    const importedTool = tools.find((tool: { title: string }) => tool.title === "Get post");
    assert.ok(importedTool);
    assert.equal(importedTool.name, "getpost_2");
    assert.equal(importedTool.slug, "getpost-2");
  } finally {
    await handle.close();
  }
});
