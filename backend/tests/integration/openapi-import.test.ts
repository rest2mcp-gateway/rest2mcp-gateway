import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "./helpers/runtime-app.js";
import { createStubBackend } from "./helpers/stub-backend.js";
import { adminRequest, callRuntime, loginAsBootstrapAdmin, validateAndPublish } from "./helpers/workflows.js";

type AdminSession = Awaited<ReturnType<typeof loginAsBootstrapAdmin>>;

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const openApiFixturesDir = path.join(currentDirPath, "fixtures", "openapi");
const openApiExamplesDir = path.join(currentDirPath, "..", "..", "..", "examples", "openapi");

const readFixture = async (name: string) => readFile(path.join(openApiFixturesDir, name), "utf8");
const readExample = async (name: string) => readFile(path.join(openApiExamplesDir, name), "utf8");

const createMcpServer = async (
  app: FastifyInstance,
  session: AdminSession,
  overrides: Partial<{
    name: string;
    slug: string;
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

test("imports the JSONPlaceholder example spec and serves the generated runtime tools", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const specText = await readExample("jsonplaceholder-posts.openapi.json");
    const backend = await createStubBackend();
    try {
      backend.on("GET", "/posts", async () => ({
        status: 200,
        body: [
          { userId: 1, id: 1, title: "First post", body: "Alpha" },
          { userId: 2, id: 2, title: "Second post", body: "Beta" }
        ]
      }));
      backend.on("GET", "/posts/1", async () => ({
        status: 200,
        body: { userId: 1, id: 1, title: "First post", body: "Alpha" }
      }));
      backend.on("POST", "/posts", async (request) => ({
        status: 201,
        body: {
          id: 101,
          ...(request.bodyJson as Record<string, unknown>)
        }
      }));
      backend.on("PUT", "/posts/1", async (request) => ({
        status: 200,
        body: {
          id: 1,
          ...(request.bodyJson as Record<string, unknown>)
        }
      }));

      const mcpServer = await createMcpServer(handle.app, session, {
        name: "Posts",
        slug: "posts",
        title: "Posts"
      });

      const result = await executeImport(handle.app, session, {
        name: "JSONPlaceholder Posts",
        slug: "jsonplaceholder-posts",
        description: "Imported from checked-in example spec",
        defaultBaseUrl: backend.baseUrl,
        targetMcpServerId: mcpServer.id,
        specText,
        operations: [
          { operationKey: "GET /posts", exposeAsTool: true },
          { operationKey: "POST /posts", exposeAsTool: true },
          { operationKey: "GET /posts/{id}", exposeAsTool: true },
          { operationKey: "PUT /posts/{id}", exposeAsTool: true }
        ]
      });

      assert.equal(result.response.statusCode, 200, result.response.body);
      assert.equal(result.body.data.importedResourceCount, 4);
      assert.equal(result.body.data.importedToolCount, 4);

      const tools = await listTools(handle.app, session, mcpServer.id);
      assert.deepEqual(
        tools.map((tool: { name: string; slug: string }) => ({ name: tool.name, slug: tool.slug })),
        [
          { name: "listposts", slug: "listposts" },
          { name: "createpost", slug: "createpost" },
          { name: "getpost", slug: "getpost" },
          { name: "updatepost", slug: "updatepost" }
        ]
      );

      const snapshot = await validateAndPublish(handle.app, session);
      assert.equal(snapshot.version, 1);

      const listPosts = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "listposts",
          arguments: {}
        }
      }, "posts");
      assert.deepEqual(listPosts.result.structuredContent, {
        items: [
          { userId: 1, id: 1, title: "First post", body: "Alpha" },
          { userId: 2, id: 2, title: "Second post", body: "Beta" }
        ]
      });

      const getPost = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "getpost",
          arguments: {
            id: 1
          }
        }
      }, "posts");
      assert.deepEqual(getPost.result.structuredContent, {
        userId: 1,
        id: 1,
        title: "First post",
        body: "Alpha"
      });

      const createPost = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "createpost",
          arguments: {
            title: "New post",
            body: "Created body",
            userId: 9
          }
        }
      }, "posts");
      assert.deepEqual(createPost.result.structuredContent, {
        id: 101,
        title: "New post",
        body: "Created body",
        userId: 9
      });

      const updatePost = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "updatepost",
          arguments: {
            id: 1,
            title: "Updated post",
            body: "Updated body",
            userId: 9
          }
        }
      }, "posts");
      assert.deepEqual(updatePost.result.structuredContent, {
        id: 1,
        title: "Updated post",
        body: "Updated body",
        userId: 9
      });

      assert.deepEqual(
        backend.requests.map((request) => ({
          method: request.method,
          path: request.path
        })),
        [
          { method: "GET", path: "/posts" },
          { method: "GET", path: "/posts/1" },
          { method: "POST", path: "/posts" },
          { method: "PUT", path: "/posts/1" }
        ]
      );
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("previews the Open-Meteo example spec and flags query-driven operations as non-exposable", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const specText = await readExample("open-meteo-forecast.openapi.json");
    const mcpServer = await createMcpServer(handle.app, session, {
      name: "Weather",
      slug: "weather",
      title: "Weather"
    });

    const preview = await previewImport(handle.app, session, {
      name: "Open-Meteo Forecast",
      slug: "open-meteo-forecast",
      description: "Imported from checked-in Open-Meteo example spec",
      defaultBaseUrl: "https://api.open-meteo.com",
      targetMcpServerId: mcpServer.id,
      specText
    });

    assert.equal(preview.response.statusCode, 200, preview.response.body);
    assert.equal(preview.body.data.operations.length, 1);
    assert.equal(preview.body.data.operations[0].operationKey, "GET /v1/forecast");
    assert.equal(preview.body.data.operations[0].exposable, false);
    assert.deepEqual(preview.body.data.operations[0].exposureIssues, [
      "Query/header/cookie parameters are not auto-exposed yet"
    ]);

    const execute = await executeImport(handle.app, session, {
      name: "Open-Meteo Forecast",
      slug: "open-meteo-forecast",
      description: "Imported from checked-in Open-Meteo example spec",
      defaultBaseUrl: "https://api.open-meteo.com",
      targetMcpServerId: mcpServer.id,
      specText,
      operations: [{ operationKey: "GET /v1/forecast", exposeAsTool: false }]
    });

    assert.equal(execute.response.statusCode, 200, execute.response.body);
    assert.equal(execute.body.data.importedResourceCount, 1);
    assert.equal(execute.body.data.importedToolCount, 0);

    const resources = await listBackendResources(handle.app, session, execute.body.data.backendApi.id);
    assert.equal(resources.length, 1);
    assert.equal(resources[0].operationId, "getForecast");
    assert.equal(resources[0].pathTemplate, "/v1/forecast");

    const tools = await listTools(handle.app, session, mcpServer.id);
    assert.equal(tools.length, 0);
  } finally {
    await handle.close();
  }
});

test("imports the IPinfo example spec and serves a runtime tool with query API-key auth", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const specText = await readExample("ipinfo-lite.openapi.json");
    const backend = await createStubBackend();
    try {
      backend.onApiKeyProtected(
        "GET",
        "/lite/8.8.8.8",
        {
          in: "query",
          name: "token",
          value: "ipinfo-test-key"
        },
        async () => ({
          status: 200,
          body: {
            ip: "8.8.8.8",
            city: "Mountain View",
            region: "California",
            country: "US",
            loc: "37.3860,-122.0838",
            timezone: "America/Los_Angeles"
          }
        })
      );

      const mcpServer = await createMcpServer(handle.app, session, {
        name: "IP Lookup",
        slug: "ip-lookup",
        title: "IP Lookup"
      });

      const execute = await executeImport(handle.app, session, {
        name: "IPinfo Lite",
        slug: "ipinfo-lite",
        description: "Imported from checked-in IPinfo example spec",
        defaultBaseUrl: backend.baseUrl,
        targetMcpServerId: mcpServer.id,
        specText,
        operations: [{ operationKey: "GET /lite/{ip}", exposeAsTool: true }]
      });

      assert.equal(execute.response.statusCode, 200, execute.response.body);
      assert.equal(execute.body.data.importedResourceCount, 1);
      assert.equal(execute.body.data.importedToolCount, 1);

      const backendApiId = execute.body.data.backendApi.id;
      const tools = await listTools(handle.app, session, mcpServer.id);
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, "lookupip");

      const patchBackendApi = await adminRequest(handle.app, session, {
        method: "PATCH",
        url: `/api/admin/v1/backend-apis/${backendApiId}`,
        payload: {
          authType: "api_key",
          apiKeyLocation: "query",
          apiKeyName: "token",
          apiKeyValue: "ipinfo-test-key"
        }
      });
      assert.equal(patchBackendApi.response.statusCode, 200, patchBackendApi.response.body);

      const snapshot = await validateAndPublish(handle.app, session);
      assert.equal(snapshot.version, 1);

      const lookupIp = await callRuntime(
        handle.app,
        session,
        {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {
            name: "lookupip",
            arguments: {
              ip: "8.8.8.8"
            }
          }
        },
        "ip-lookup"
      );

      assert.deepEqual(lookupIp.result.structuredContent, {
        ip: "8.8.8.8",
        city: "Mountain View",
        region: "California",
        country: "US",
        loc: "37.3860,-122.0838",
        timezone: "America/Los_Angeles"
      });

      assert.equal(backend.requests.length, 1);
      assert.equal(backend.requests[0]?.path, "/lite/8.8.8.8?token=ipinfo-test-key");
      assert.equal(backend.requests[0]?.query.token, "ipinfo-test-key");
    } finally {
      await backend.close();
    }
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
