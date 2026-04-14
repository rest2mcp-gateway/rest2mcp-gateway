import assert from "node:assert/strict";
import test from "node:test";
import { serializeValidationResult } from "../../src/modules/config/serializer.js";
import { validateDraftContext, type DraftContext } from "../../src/modules/config/service.js";

const createDraftContext = (): DraftContext => ({
  latestSnapshot: null,
  authServerConfig: null,
  backendApis: [
    {
      id: "api-1",
      organizationId: "org-1",
      name: "Backend API",
      slug: "backend-api",
      description: null,
      defaultBaseUrl: "https://example.com",
      authType: "none",
      authConfig: {},
      defaultTimeoutMs: 30000,
      retryPolicy: { retries: 0 },
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
    }
  ],
  scopes: [
    {
      id: "scope-1",
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
  toolScopes: [{ toolId: "tool-1", scopeId: "scope-1" }],
  secrets: []
} as DraftContext);

test("validation result shape is deterministic", () => {
  assert.deepEqual(serializeValidationResult([]), {
    valid: true,
    issues: []
  });
  assert.deepEqual(serializeValidationResult(["missing tool mapping"]), {
    valid: false,
    issues: ["missing tool mapping"]
  });
});

test("validateDraftContext returns no issues for a valid draft", () => {
  assert.deepEqual(validateDraftContext(createDraftContext()), []);
});

test("validateDraftContext reports missing MCP servers", () => {
  const context = createDraftContext();
  context.mcpServers = [];

  assert.deepEqual(validateDraftContext(context), [
    "At least one MCP server is required",
    "Every tool must reference an existing MCP server"
  ]);
});

test("validateDraftContext reports protected servers without auth configuration", () => {
  const context = createDraftContext();
  context.mcpServers[0] = {
    ...context.mcpServers[0],
    accessMode: "protected",
    audience: "urn:test"
  };

  assert.deepEqual(validateDraftContext(context), [
    "A protected MCP server requires an authorization server configuration"
  ]);
});

test("validateDraftContext reports protected servers without audience", () => {
  const context = createDraftContext();
  context.authServerConfig = {
    id: "auth-1",
    organizationId: "org-1",
    issuer: "https://issuer.example.com",
    jwksUri: "https://issuer.example.com/jwks.json"
  };
  context.mcpServers[0] = {
    ...context.mcpServers[0],
    accessMode: "protected",
    audience: null
  };

  assert.deepEqual(validateDraftContext(context), [
    "Every protected MCP server must define an audience"
  ]);
});

test("validateDraftContext reports tools that reference missing servers", () => {
  const context = createDraftContext();
  context.tools[0] = { ...context.tools[0], mcpServerId: "missing-server" };

  assert.deepEqual(validateDraftContext(context), [
    "Every tool must reference an existing MCP server"
  ]);
});

test("validateDraftContext reports mappings that reference missing tools", () => {
  const context = createDraftContext();
  context.toolMappings[0] = { ...context.toolMappings[0], toolId: "missing-tool" };

  assert.deepEqual(validateDraftContext(context), [
    "Every tool mapping must reference an existing tool",
    "Every tool must define a backend mapping before publish"
  ]);
});

test("validateDraftContext reports mappings that reference missing resources", () => {
  const context = createDraftContext();
  context.toolMappings[0] = { ...context.toolMappings[0], backendResourceId: "missing-resource" };

  assert.deepEqual(validateDraftContext(context), [
    "Every tool mapping must reference an existing backend resource"
  ]);
});

test("validateDraftContext reports tools without mappings", () => {
  const context = createDraftContext();
  context.toolMappings = [];

  assert.deepEqual(validateDraftContext(context), [
    "Every tool must define a backend mapping before publish"
  ]);
});

test("validateDraftContext reports duplicate mappings per tool", () => {
  const context = createDraftContext();
  context.toolMappings.push({
    ...context.toolMappings[0],
    id: "mapping-2"
  });

  assert.deepEqual(validateDraftContext(context), [
    "Each tool may only define one mapping"
  ]);
});

test("validateDraftContext reports backend API mismatches between mappings and resources", () => {
  const context = createDraftContext();
  context.toolMappings[0] = { ...context.toolMappings[0], backendApiId: "api-2" };

  assert.deepEqual(validateDraftContext(context), [
    "Every tool mapping must reference a backend resource belonging to the selected backend API"
  ]);
});
