import assert from "node:assert/strict";
import test from "node:test";
import { encryptSecret } from "../../src/lib/crypto.js";
import { AppError } from "../../src/lib/errors.js";
import {
  applyAuthConfig,
  compileSnapshot,
  createContentBlocks,
  createStructuredContent,
  joinUrl,
  normalizeToolArguments,
  normalizeBackendErrorResponse,
  parseBackendResponse,
  parseRetryCount,
  parseSnapshotJson,
  redactUrlForLog,
  renderBodyTemplate,
  renderPathTemplate
} from "../../src/modules/runtime/service.js";

test("renderPathTemplate supports braces and dollar placeholders", () => {
  assert.equal(
    renderPathTemplate("/widgets/{widgetId}/owners/$ownerId", {
      widgetId: "widget-42",
      ownerId: "owner-9"
    }),
    "/widgets/widget-42/owners/owner-9"
  );
});

test("renderPathTemplate throws for missing input", () => {
  assert.throws(
    () => renderPathTemplate("/widgets/{widgetId}", {}),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "missing_tool_input");
      return true;
    }
  );
});

test("renderBodyTemplate supports raw placeholders and nested string interpolation", () => {
  const rendered = renderBodyTemplate(
    "{\"widgetId\": {{ widgetId }}, \"ownerId\": $ownerId, \"message\": \"hello {{name}}\", \"nested\": {\"count\": $count}}",
    {
      widgetId: "widget-42",
      ownerId: "owner-9",
      name: "Federico",
      count: 3
    }
  );

  assert.deepEqual(rendered, {
    widgetId: "widget-42",
    ownerId: "owner-9",
    message: "hello Federico",
    nested: { count: 3 }
  });
});

test("renderBodyTemplate throws for missing raw placeholder input", () => {
  assert.throws(
    () => renderBodyTemplate("{\"widgetId\": {{ widgetId }}}", {}),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "missing_tool_input");
      return true;
    }
  );
});

test("renderBodyTemplate preserves escaped strings and supports array placeholders", () => {
  const rendered = renderBodyTemplate(
    "{\"message\":\"say \\\"{{name}}\\\"\",\"tags\":{{tags}},\"metadata\":{\"active\":$active}}",
    {
      name: "Ada",
      tags: ["alpha", "beta"],
      active: true
    }
  );

  assert.deepEqual(rendered, {
    message: "say \"Ada\"",
    tags: ["alpha", "beta"],
    metadata: { active: true }
  });
});

test("renderBodyTemplate surfaces invalid JSON templates", () => {
  assert.throws(
    () => renderBodyTemplate("{\"widgetId\": {{ widgetId }", { widgetId: "widget-42" }),
    /JSON/
  );
});

test("applyAuthConfig sets header API keys and redacts query API keys in logs", () => {
  const headerUrl = new URL("https://backend.example.com/widgets");
  const headerHeaders = new Headers();
  applyAuthConfig(headerUrl, headerHeaders, {
    id: "api-1",
    organizationId: "org-1",
    name: "Header API",
    slug: "header-api",
    description: null,
    defaultBaseUrl: "https://backend.example.com",
    authType: "api_key",
    authConfig: { name: "x-api-key", in: "header", value: "top-secret" },
    defaultTimeoutMs: 30000,
    retryPolicy: { retries: 0 },
    isActive: true
  });
  assert.equal(headerHeaders.get("x-api-key"), "top-secret");

  const queryUrl = new URL("https://backend.example.com/widgets");
  applyAuthConfig(queryUrl, new Headers(), {
    id: "api-2",
    organizationId: "org-1",
    name: "Query API",
    slug: "query-api",
    description: null,
    defaultBaseUrl: "https://backend.example.com",
    authType: "api_key",
    authConfig: { name: "api_key", in: "query", value: "top-secret" },
    defaultTimeoutMs: 30000,
    retryPolicy: { retries: 0 },
    isActive: true
  });
  assert.equal(queryUrl.searchParams.get("api_key"), "top-secret");
  assert.equal(
    redactUrlForLog(queryUrl, {
      id: "api-2",
      organizationId: "org-1",
      name: "Query API",
      slug: "query-api",
      description: null,
      defaultBaseUrl: "https://backend.example.com",
      authType: "api_key",
      authConfig: { name: "api_key", in: "query", value: "top-secret" },
      defaultTimeoutMs: 30000,
      retryPolicy: { retries: 0 },
      isActive: true
    }),
    "https://backend.example.com/widgets?api_key=%5Bredacted%5D"
  );
});

test("applyAuthConfig resolves bearer, oauth2, and basic secrets", () => {
  const bearerHeaders = new Headers();
  applyAuthConfig(new URL("https://backend.example.com"), bearerHeaders, {
    id: "api-1",
    organizationId: "org-1",
    name: "Bearer API",
    slug: "bearer-api",
    description: null,
    defaultBaseUrl: "https://backend.example.com",
    authType: "bearer",
    authConfig: { encryptedToken: encryptSecret("bearer-secret") },
    defaultTimeoutMs: 30000,
    retryPolicy: {},
    isActive: true
  });
  assert.equal(bearerHeaders.get("authorization"), "Bearer bearer-secret");

  const oauthHeaders = new Headers();
  applyAuthConfig(new URL("https://backend.example.com"), oauthHeaders, {
    id: "api-2",
    organizationId: "org-1",
    name: "OAuth API",
    slug: "oauth-api",
    description: null,
    defaultBaseUrl: "https://backend.example.com",
    authType: "oauth2",
    authConfig: { encryptedAccessToken: encryptSecret("oauth-secret") },
    defaultTimeoutMs: 30000,
    retryPolicy: {},
    isActive: true
  });
  assert.equal(oauthHeaders.get("authorization"), "Bearer oauth-secret");

  const basicHeaders = new Headers();
  applyAuthConfig(new URL("https://backend.example.com"), basicHeaders, {
    id: "api-3",
    organizationId: "org-1",
    name: "Basic API",
    slug: "basic-api",
    description: null,
    defaultBaseUrl: "https://backend.example.com",
    authType: "basic",
    authConfig: {
      username: "alice",
      encryptedPassword: encryptSecret("p@ss")
    },
    defaultTimeoutMs: 30000,
    retryPolicy: {},
    isActive: true
  });
  assert.equal(
    basicHeaders.get("authorization"),
    `Basic ${Buffer.from("alice:p@ss").toString("base64")}`
  );
});

test("applyAuthConfig supports legacy plaintext secret fields", () => {
  const bearerHeaders = new Headers();
  applyAuthConfig(new URL("https://backend.example.com"), bearerHeaders, {
    id: "api-1",
    organizationId: "org-1",
    name: "Bearer API",
    slug: "bearer-api",
    description: null,
    defaultBaseUrl: "https://backend.example.com",
    authType: "bearer",
    authConfig: { token: "legacy-bearer" },
    defaultTimeoutMs: 30000,
    retryPolicy: {},
    isActive: true
  });
  assert.equal(bearerHeaders.get("authorization"), "Bearer legacy-bearer");

  const oauthHeaders = new Headers();
  applyAuthConfig(new URL("https://backend.example.com"), oauthHeaders, {
    id: "api-2",
    organizationId: "org-1",
    name: "OAuth API",
    slug: "oauth-api",
    description: null,
    defaultBaseUrl: "https://backend.example.com",
    authType: "oauth2",
    authConfig: { accessToken: "legacy-oauth" },
    defaultTimeoutMs: 30000,
    retryPolicy: {},
    isActive: true
  });
  assert.equal(oauthHeaders.get("authorization"), "Bearer legacy-oauth");

  const basicHeaders = new Headers();
  applyAuthConfig(new URL("https://backend.example.com"), basicHeaders, {
    id: "api-3",
    organizationId: "org-1",
    name: "Basic API",
    slug: "basic-api",
    description: null,
    defaultBaseUrl: "https://backend.example.com",
    authType: "basic",
    authConfig: {
      username: "legacy-user",
      password: "legacy-pass"
    },
    defaultTimeoutMs: 30000,
    retryPolicy: {},
    isActive: true
  });
  assert.equal(
    basicHeaders.get("authorization"),
    `Basic ${Buffer.from("legacy-user:legacy-pass").toString("base64")}`
  );

  const queryUrl = new URL("https://backend.example.com/widgets");
  applyAuthConfig(queryUrl, new Headers(), {
    id: "api-4",
    organizationId: "org-1",
    name: "API Key API",
    slug: "api-key-api",
    description: null,
    defaultBaseUrl: "https://backend.example.com",
    authType: "api_key",
    authConfig: { name: "api_key", in: "query", value: "legacy-secret" },
    defaultTimeoutMs: 30000,
    retryPolicy: {},
    isActive: true
  });
  assert.equal(queryUrl.searchParams.get("api_key"), "legacy-secret");
});

test("joinUrl normalizes leading and trailing slashes", () => {
  assert.equal(
    joinUrl("https://backend.example.com/api", "/widgets").toString(),
    "https://backend.example.com/api/widgets"
  );
  assert.equal(
    joinUrl("https://backend.example.com/api/", "widgets").toString(),
    "https://backend.example.com/api/widgets"
  );
});

test("parseRetryCount and normalizeToolArguments are defensive", () => {
  assert.equal(parseRetryCount({ retries: 2 }), 2);
  assert.equal(parseRetryCount({ retries: -1 }), 0);
  assert.equal(parseRetryCount(null), 0);
  assert.deepEqual(normalizeToolArguments({ widgetId: "widget-42" }), { widgetId: "widget-42" });
  assert.deepEqual(normalizeToolArguments("invalid"), {});
  assert.deepEqual(normalizeToolArguments(["invalid"]), {});
});

test("parseBackendResponse reads json and plain text bodies", async () => {
  const jsonResponse = new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" }
  });
  const textResponse = new Response("plain-text", {
    headers: { "content-type": "text/plain" }
  });
  const emptyResponse = new Response(null, {
    status: 204,
    headers: { "content-type": "text/plain" }
  });

  assert.deepEqual(await parseBackendResponse(jsonResponse), { ok: true });
  assert.equal(await parseBackendResponse(textResponse), "plain-text");
  assert.equal(await parseBackendResponse(emptyResponse), "");
});

test("createContentBlocks formats strings and objects for MCP output", () => {
  assert.deepEqual(createContentBlocks("plain-text"), [{ type: "text", text: "plain-text" }]);
  assert.deepEqual(createContentBlocks({ ok: true }), [
    { type: "text", text: "{\n  \"ok\": true\n}" }
  ]);
});

test("createStructuredContent preserves objects and wraps top-level arrays", () => {
  assert.deepEqual(createStructuredContent({ ok: true }), { ok: true });
  assert.deepEqual(createStructuredContent([{ id: 1 }, { id: 2 }]), {
    items: [{ id: 1 }, { id: 2 }]
  });
});

test("createStructuredContent omits scalar values that are not valid MCP structured content", () => {
  assert.equal(createStructuredContent("plain-text"), undefined);
  assert.equal(createStructuredContent(42), undefined);
  assert.equal(createStructuredContent(null), undefined);
});

test("normalizeBackendErrorResponse maps known backend statuses to explicit MCP tool errors", () => {
  assert.deepEqual(normalizeBackendErrorResponse(404, {}), {
    status: 404,
    error: "backend_not_found",
    message: "Backend returned 404 Not Found"
  });
  assert.deepEqual(normalizeBackendErrorResponse(401, {}), {
    status: 401,
    error: "backend_unauthorized",
    message: "Backend returned 401 Unauthorized"
  });
  assert.deepEqual(normalizeBackendErrorResponse(403, {}), {
    status: 403,
    error: "backend_forbidden",
    message: "Backend returned 403 Forbidden"
  });
  assert.deepEqual(normalizeBackendErrorResponse(409, {}), {
    status: 409,
    error: "backend_conflict",
    message: "Backend returned 409 Conflict"
  });
  assert.deepEqual(normalizeBackendErrorResponse(422, {}), {
    status: 422,
    error: "backend_validation_error",
    message: "Backend returned 422 Unprocessable Content"
  });
  assert.deepEqual(normalizeBackendErrorResponse(429, {}), {
    status: 429,
    error: "backend_rate_limited",
    message: "Backend returned 429 Too Many Requests"
  });
  assert.deepEqual(normalizeBackendErrorResponse(500, {}), {
    status: 500,
    error: "backend_internal_error",
    message: "Backend returned 500 Internal Server Error"
  });
  assert.deepEqual(normalizeBackendErrorResponse(502, {}), {
    status: 502,
    error: "backend_unavailable",
    message: "Backend returned 502 Bad Gateway"
  });
  assert.deepEqual(normalizeBackendErrorResponse(503, {}), {
    status: 503,
    error: "backend_unavailable",
    message: "Backend returned 503 Service Unavailable"
  });
  assert.deepEqual(normalizeBackendErrorResponse(504, {}), {
    status: 504,
    error: "backend_unavailable",
    message: "Backend returned 504 Gateway Timeout"
  });
  assert.deepEqual(normalizeBackendErrorResponse(400, {}), {
    status: 400,
    error: "backend_bad_request",
    message: "Backend returned 400 Bad Request"
  });
});

test("normalizeBackendErrorResponse preserves useful backend error bodies and fills gaps", () => {
  assert.deepEqual(
    normalizeBackendErrorResponse(502, {
      error: "backend_unavailable",
      message: "Stub backend failed"
    }),
    {
      status: 502,
      error: "backend_unavailable",
      message: "Stub backend failed"
    }
  );

  assert.deepEqual(normalizeBackendErrorResponse(404, "No matching post"), {
    status: 404,
    error: "backend_not_found",
    message: "No matching post"
  });

  assert.deepEqual(normalizeBackendErrorResponse(422, [{ field: "title", error: "required" }]), {
    status: 422,
    error: "backend_validation_error",
    message: "Backend returned 422 Unprocessable Content",
    details: [{ field: "title", error: "required" }]
  });
});

test("parseSnapshotJson and compileSnapshot normalize runtime state", () => {
  const snapshot = parseSnapshotJson({
    version: 7,
    generatedAt: "2026-01-01T00:00:00.000Z",
    authServerConfig: {
      id: "auth-1",
      organizationId: "org-1",
      issuer: "https://issuer.example.com",
      jwksUri: "https://issuer.example.com/jwks.json"
    },
    backendApis: [
      {
        id: "api-1",
        organizationId: "org-1",
        name: "Backend API",
        slug: "backend-api",
        description: null,
        defaultBaseUrl: "https://backend.example.com",
        authType: "none",
        authConfig: {},
        defaultTimeoutMs: 30000,
        retryPolicy: {},
        isActive: true
      }
    ],
    backendResources: [
      {
        id: "resource-1",
        backendApiId: "api-1",
        name: "Widget resource",
        operationId: "createWidget",
        description: null,
        httpMethod: "POST",
        pathTemplate: "/widgets/{widgetId}",
        bodyTemplate: null,
        requestSchema: {},
        responseSchema: {},
        isActive: true
      }
    ],
    mcpServers: [
      {
        id: "server-1",
        organizationId: "org-1",
        name: "Public server",
        slug: "public-server",
        version: "1.0.0",
        title: "Public Server",
        description: null,
        authMode: "local",
        accessMode: "public",
        audience: null,
        isActive: true
      }
    ],
    tools: [
      {
        id: "tool-1",
        mcpServerId: "server-1",
        name: "create_widget",
        slug: "create-widget",
        title: "Create widget",
        description: null,
        inputSchema: {},
        outputSchema: {},
        examples: [],
        riskLevel: "low",
        isActive: true
      },
      {
        id: "tool-2",
        mcpServerId: "server-1",
        name: "inactive_tool",
        slug: "inactive-tool",
        title: "Inactive tool",
        description: null,
        inputSchema: {},
        outputSchema: {},
        examples: [],
        riskLevel: "low",
        isActive: false
      }
    ],
    scopes: [
      {
        id: "scope-1",
        organizationId: "org-1",
        name: "widgets:read",
        description: null,
        category: null,
        isSensitive: false
      },
      {
        id: "scope-2",
        organizationId: "org-1",
        name: "widgets:write",
        description: null,
        category: null,
        isSensitive: false
      }
    ],
    toolMappings: [
      {
        id: "mapping-1",
        toolId: "tool-1",
        backendApiId: "api-1",
        backendResourceId: "resource-1",
        requestMapping: {},
        responseMapping: {},
        errorMapping: {},
        authStrategy: "inherit",
        timeoutOverrideMs: null,
        retryOverride: null,
        isActive: true
      }
    ],
    toolScopes: [
      { toolId: "tool-1", scopeId: "scope-1" },
      { toolId: "tool-1", scopeId: "scope-2" },
      { toolId: "tool-1", scopeId: "scope-1" }
    ]
  });

  const serversBySlug = compileSnapshot("acme", snapshot);
  const server = serversBySlug.get("public-server");

  assert.ok(server);
  assert.equal(server.snapshotVersion, 7);
  assert.deepEqual(server.requiredScopes, ["widgets:read", "widgets:write"]);
  assert.equal(server.tools.length, 1);
  assert.equal(server.toolsByName.get("create_widget")?.backendResource.operationId, "createWidget");
});

test("compileSnapshot filters inactive servers, tools, APIs, and resources", () => {
  const serversBySlug = compileSnapshot("acme", parseSnapshotJson({
    version: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    authServerConfig: null,
    backendApis: [
      {
        id: "api-active",
        organizationId: "org-1",
        name: "Active API",
        slug: "active-api",
        description: null,
        defaultBaseUrl: "https://active.example.com",
        authType: "none",
        authConfig: {},
        defaultTimeoutMs: 30000,
        retryPolicy: {},
        isActive: true
      },
      {
        id: "api-inactive",
        organizationId: "org-1",
        name: "Inactive API",
        slug: "inactive-api",
        description: null,
        defaultBaseUrl: "https://inactive.example.com",
        authType: "none",
        authConfig: {},
        defaultTimeoutMs: 30000,
        retryPolicy: {},
        isActive: false
      }
    ],
    backendResources: [
      {
        id: "resource-active",
        backendApiId: "api-active",
        name: "Active resource",
        operationId: "activeResource",
        description: null,
        httpMethod: "POST",
        pathTemplate: "/widgets/{widgetId}",
        bodyTemplate: null,
        requestSchema: {},
        responseSchema: {},
        isActive: true
      },
      {
        id: "resource-inactive",
        backendApiId: "api-active",
        name: "Inactive resource",
        operationId: "inactiveResource",
        description: null,
        httpMethod: "POST",
        pathTemplate: "/widgets/{widgetId}",
        bodyTemplate: null,
        requestSchema: {},
        responseSchema: {},
        isActive: false
      }
    ],
    mcpServers: [
      {
        id: "server-active",
        organizationId: "org-1",
        name: "Active Server",
        slug: "active-server",
        version: "1.0.0",
        title: "Active Server",
        description: null,
        authMode: "local",
        accessMode: "public",
        audience: null,
        isActive: true
      },
      {
        id: "server-inactive",
        organizationId: "org-1",
        name: "Inactive Server",
        slug: "inactive-server",
        version: "1.0.0",
        title: "Inactive Server",
        description: null,
        authMode: "local",
        accessMode: "public",
        audience: null,
        isActive: false
      }
    ],
    tools: [
      {
        id: "tool-active",
        mcpServerId: "server-active",
        name: "active_tool",
        slug: "active-tool",
        title: "Active Tool",
        description: null,
        inputSchema: {},
        outputSchema: {},
        examples: [],
        riskLevel: "low",
        isActive: true
      },
      {
        id: "tool-inactive",
        mcpServerId: "server-active",
        name: "inactive_tool",
        slug: "inactive-tool",
        title: "Inactive Tool",
        description: null,
        inputSchema: {},
        outputSchema: {},
        examples: [],
        riskLevel: "low",
        isActive: false
      },
      {
        id: "tool-with-inactive-api",
        mcpServerId: "server-active",
        name: "inactive_api_tool",
        slug: "inactive-api-tool",
        title: "Inactive API Tool",
        description: null,
        inputSchema: {},
        outputSchema: {},
        examples: [],
        riskLevel: "low",
        isActive: true
      },
      {
        id: "tool-on-inactive-server",
        mcpServerId: "server-inactive",
        name: "inactive_server_tool",
        slug: "inactive-server-tool",
        title: "Inactive Server Tool",
        description: null,
        inputSchema: {},
        outputSchema: {},
        examples: [],
        riskLevel: "low",
        isActive: true
      }
    ],
    scopes: [],
    toolMappings: [
      {
        id: "mapping-active",
        toolId: "tool-active",
        backendApiId: "api-active",
        backendResourceId: "resource-active",
        requestMapping: {},
        responseMapping: {},
        errorMapping: {},
        authStrategy: "inherit",
        timeoutOverrideMs: null,
        retryOverride: null,
        isActive: true
      },
      {
        id: "mapping-to-inactive-resource",
        toolId: "tool-inactive",
        backendApiId: "api-active",
        backendResourceId: "resource-inactive",
        requestMapping: {},
        responseMapping: {},
        errorMapping: {},
        authStrategy: "inherit",
        timeoutOverrideMs: null,
        retryOverride: null,
        isActive: true
      },
      {
        id: "mapping-to-inactive-api",
        toolId: "tool-with-inactive-api",
        backendApiId: "api-inactive",
        backendResourceId: "resource-active",
        requestMapping: {},
        responseMapping: {},
        errorMapping: {},
        authStrategy: "inherit",
        timeoutOverrideMs: null,
        retryOverride: null,
        isActive: true
      }
    ],
    toolScopes: []
  }));

  assert.equal(serversBySlug.size, 1);
  const server = serversBySlug.get("active-server");
  assert.ok(server);
  assert.deepEqual(server.tools.map((entry) => entry.tool.name), ["active_tool"]);
});
