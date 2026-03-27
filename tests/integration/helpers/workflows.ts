import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

type AdminSession = {
  token: string;
  organizationId: string;
  organizationSlug: string;
};

type RuntimeFixture = {
  backendApiId: string;
  backendResourceId: string;
  mcpServerId: string;
  toolId: string;
};

const TEST_ADMIN = {
  email: "admin@test.local",
  password: "test-password-123",
  organizationSlug: "runtime-test-org"
} as const;

const parseSseJsonBody = (bodyText: string) => {
  const events = bodyText
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const event of events) {
    const dataLines = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());

    if (dataLines.length === 0) {
      continue;
    }

    return JSON.parse(dataLines.join("\n")) as unknown;
  }

  throw new Error(`Unable to parse SSE body: ${bodyText}`);
};

const request = async (
  app: FastifyInstance,
  {
    method,
    url,
    token,
    payload,
    headers
  }: {
    method: string;
    url: string;
    token?: string;
    payload?: unknown;
    headers?: Record<string, string>;
  }
) => {
  const response = await app.inject({
    method,
    url,
    payload,
    headers: {
      ...(token
        ? {
            authorization: `Bearer ${token}`
          }
        : {}),
      ...(headers ?? {})
    }
  });

  const contentType = String(response.headers["content-type"] ?? "");
  const rawBody = response.body;
  const body =
    contentType.includes("text/event-stream") || rawBody.startsWith("event:")
      ? parseSseJsonBody(rawBody)
      : response.json();
  return { response, body };
};

export const loginAsBootstrapAdmin = async (app: FastifyInstance): Promise<AdminSession> => {
  const { response, body } = await request(app, {
    method: "POST",
    url: "/api/admin/v1/auth/login",
    payload: {
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password
    }
  });

  assert.equal(response.statusCode, 200, body.message ?? response.body);

  return {
    token: body.data.token,
    organizationId: body.data.user.organizationId,
    organizationSlug: TEST_ADMIN.organizationSlug
  };
};

export const createRuntimeFixture = async (
  app: FastifyInstance,
  session: AdminSession,
  backendBaseUrl: string
): Promise<RuntimeFixture> => {
  const backendApi = await request(app, {
    method: "POST",
    url: "/api/admin/v1/backend-apis",
    token: session.token,
    payload: {
      organizationId: session.organizationId,
      name: "Stub Backend",
      slug: "stub-backend",
      defaultBaseUrl: backendBaseUrl,
      authType: "none",
      defaultTimeoutMs: 5_000,
      retryPolicy: { retries: 0 },
      isActive: true
    }
  });
  assert.equal(backendApi.response.statusCode, 200, backendApi.response.body);

  const backendResource = await request(app, {
    method: "POST",
    url: "/api/admin/v1/backend-resources",
    token: session.token,
    payload: {
      backendApiId: backendApi.body.data.id,
      name: "Echo Widget",
      operationId: "echoWidget",
      httpMethod: "POST",
      pathTemplate: "/widgets/{widgetId}",
      bodyTemplate:
        "{\"message\":\"hello {{name}}\",\"count\":$count,\"tags\":{{tags}}}",
      requestSchema: {},
      responseSchema: {},
      isActive: true
    }
  });
  assert.equal(backendResource.response.statusCode, 200, backendResource.response.body);

  const mcpServer = await request(app, {
    method: "POST",
    url: "/api/admin/v1/mcp-servers",
    token: session.token,
    payload: {
      organizationId: session.organizationId,
      name: "Public Runtime Server",
      slug: "public-runtime-server",
      version: "1.0.0",
      title: "Public Runtime Server",
      authMode: "local",
      accessMode: "public",
      isActive: true
    }
  });
  assert.equal(mcpServer.response.statusCode, 200, mcpServer.response.body);

  const tool = await request(app, {
    method: "POST",
    url: "/api/admin/v1/tools",
    token: session.token,
    payload: {
      mcpServerId: mcpServer.body.data.id,
      name: "echo_widget",
      slug: "echo-widget",
      title: "Echo Widget",
      description: "Echoes a widget call through the runtime",
      inputSchema: {
        type: "object",
        properties: {
          widgetId: { type: "string" },
          name: { type: "string" },
          count: { type: "number" },
          tags: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["widgetId", "name", "count", "tags"]
      },
      outputSchema: {
        type: "object"
      },
      examples: [],
      riskLevel: "low",
      isActive: true,
      scopeIds: [],
      mapping: {
        backendResourceId: backendResource.body.data.id,
        requestMapping: {},
        responseMapping: {},
        errorMapping: {},
        authStrategy: "inherit",
        timeoutOverrideMs: null,
        retryOverride: null,
        isActive: true
      }
    }
  });
  assert.equal(tool.response.statusCode, 200, tool.response.body);

  return {
    backendApiId: backendApi.body.data.id,
    backendResourceId: backendResource.body.data.id,
    mcpServerId: mcpServer.body.data.id,
    toolId: tool.body.data.id
  };
};

export const validateAndPublish = async (
  app: FastifyInstance,
  session: AdminSession
) => {
  const validation = await request(app, {
    method: "GET",
    url: `/api/admin/v1/config/validate/${session.organizationId}`,
    token: session.token
  });
  assert.equal(validation.response.statusCode, 200, validation.response.body);
  assert.deepEqual(validation.body.data, { valid: true, issues: [] });

  const publish = await request(app, {
    method: "POST",
    url: "/api/admin/v1/config/publish",
    token: session.token,
    payload: {
      organizationId: session.organizationId,
      notes: "integration test publish"
    }
  });
  assert.equal(publish.response.statusCode, 200, publish.response.body);
  assert.equal(publish.body.data.published, true);

  return publish.body.data.snapshot;
};

export const getRuntimeDiscovery = async (
  app: FastifyInstance,
  session: AdminSession,
  serverSlug = "public-runtime-server"
) => {
  const result = await request(app, {
    method: "GET",
    url: `/mcp/.well-known/oauth-protected-resource/${session.organizationSlug}/${serverSlug}`
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body;
};

export const callRuntime = async (
  app: FastifyInstance,
  session: AdminSession,
  body: Record<string, unknown>,
  serverSlug = "public-runtime-server"
) => {
  const result = await request(app, {
    method: "POST",
    url: `/mcp/${session.organizationSlug}/${serverSlug}`,
    payload: body,
    headers: {
      accept: "application/json, text/event-stream"
    }
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body;
};

export const updateToolDescription = async (
  app: FastifyInstance,
  session: AdminSession,
  toolId: string,
  description: string
) => {
  const result = await request(app, {
    method: "PATCH",
    url: `/api/admin/v1/tools/${toolId}`,
    token: session.token,
    payload: {
      description
    }
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body.data;
};
