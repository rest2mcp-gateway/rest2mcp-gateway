import assert from "node:assert/strict";
import test from "node:test";
import { encryptSecret } from "../../src/lib/crypto.js";
import { AppError } from "../../src/lib/errors.js";
import {
  applyAuthConfig,
  compileSnapshot,
  createContentBlocks,
  joinUrl,
  normalizeToolArguments,
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

  assert.deepEqual(await parseBackendResponse(jsonResponse), { ok: true });
  assert.equal(await parseBackendResponse(textResponse), "plain-text");
});

test("createContentBlocks formats strings and objects for MCP output", () => {
  assert.deepEqual(createContentBlocks("plain-text"), [{ type: "text", text: "plain-text" }]);
  assert.deepEqual(createContentBlocks({ ok: true }), [
    { type: "text", text: "{\n  \"ok\": true\n}" }
  ]);
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
