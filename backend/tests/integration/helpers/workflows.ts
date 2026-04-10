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
  scopeIds: string[];
};

type CreateOrganizationInput = {
  name: string;
  slug: string;
};

type CreateUserInput = {
  organizationId: string;
  username: string;
  name: string;
  role: "super_admin" | "admin" | "editor" | "viewer";
  authMode: "local" | "oidc";
  password?: string;
  isActive?: boolean;
};

type BackendApiAuthOptions = {
  authType?: "none" | "api_key";
  apiKeyLocation?: "header" | "query";
  apiKeyName?: string;
  apiKeyValue?: string;
  tokenExchangeEnabled?: boolean;
  tokenExchangeAudience?: string;
};

type McpServerOptions =
  | {
      accessMode?: "public";
      audience?: undefined;
      scopeNames?: string[];
    }
  | {
      accessMode: "protected";
      audience: string;
      scopeNames?: string[];
    };

const TEST_ADMIN = {
  username: "admin",
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

export const request = async (
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

export const adminRequest = async (
  app: FastifyInstance,
  session: AdminSession,
  input: {
    method: string;
    url: string;
    payload?: unknown;
    headers?: Record<string, string>;
  }
) =>
  request(app, {
    ...input,
    token: session.token
  });

export const loginAsBootstrapAdmin = async (app: FastifyInstance): Promise<AdminSession> => {
  const { response, body } = await request(app, {
    method: "POST",
    url: "/api/admin/v1/auth/login",
    payload: {
      username: TEST_ADMIN.username,
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
  backendBaseUrl: string,
  authOptions: BackendApiAuthOptions = { authType: "none" },
  mcpOptions: McpServerOptions = { accessMode: "public", scopeNames: [] }
): Promise<RuntimeFixture> => {
  const scopeIds: string[] = [];
  for (const scopeName of mcpOptions.scopeNames ?? []) {
    const scope = await request(app, {
      method: "POST",
      url: "/api/admin/v1/scopes",
      token: session.token,
      payload: {
        organizationId: session.organizationId,
        name: scopeName,
        description: `Scope ${scopeName}`,
        category: "runtime",
        isSensitive: false
      }
    });
    assert.equal(scope.response.statusCode, 200, scope.response.body);
    scopeIds.push(scope.body.data.id);
  }

  const backendApi = await request(app, {
    method: "POST",
    url: "/api/admin/v1/backend-apis",
    token: session.token,
    payload: {
      organizationId: session.organizationId,
      name: "Stub Backend",
      slug: "stub-backend",
      defaultBaseUrl: backendBaseUrl,
      authType: authOptions.authType ?? "none",
      ...(authOptions.authType === "api_key"
        ? {
            apiKeyLocation: authOptions.apiKeyLocation,
            apiKeyName: authOptions.apiKeyName,
            apiKeyValue: authOptions.apiKeyValue
          }
        : {}),
      tokenExchangeEnabled: authOptions.tokenExchangeEnabled ?? false,
      ...(authOptions.tokenExchangeEnabled
        ? {
            tokenExchangeAudience: authOptions.tokenExchangeAudience
          }
        : {}),
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
      accessMode: mcpOptions.accessMode ?? "public",
      ...(mcpOptions.accessMode === "protected"
        ? { audience: mcpOptions.audience }
        : {}),
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
      scopeIds,
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
    toolId: tool.body.data.id,
    scopeIds
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

export const createOrganization = async (
  app: FastifyInstance,
  session: AdminSession,
  payload: CreateOrganizationInput
) => {
  const result = await adminRequest(app, session, {
    method: "POST",
    url: "/api/admin/v1/organizations",
    payload
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body.data;
};

export const createUser = async (
  app: FastifyInstance,
  session: AdminSession,
  payload: CreateUserInput
) => {
  const result = await adminRequest(app, session, {
    method: "POST",
    url: "/api/admin/v1/users",
    payload
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body.data;
};

export const updateUser = async (
  app: FastifyInstance,
  session: AdminSession,
  userId: string,
  payload: Partial<CreateUserInput>
) => {
  const result = await adminRequest(app, session, {
    method: "PATCH",
    url: `/api/admin/v1/users/${userId}`,
    payload
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body.data;
};

export const listExecutionLogs = async (
  app: FastifyInstance,
  session: AdminSession
) => {
  const result = await adminRequest(app, session, {
    method: "GET",
    url: `/api/admin/v1/execution-logs/${session.organizationId}`
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body.data;
};

export const getTool = async (
  app: FastifyInstance,
  session: AdminSession,
  toolId: string
) => {
  const result = await adminRequest(app, session, {
    method: "GET",
    url: `/api/admin/v1/tools/${toolId}`
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body.data;
};

export const getRuntimeDiscovery = async (
  app: FastifyInstance,
  session: AdminSession,
  serverSlug = "public-runtime-server"
) => {
  const result = await request(app, {
    method: "GET",
    url: `/.well-known/oauth-protected-resource/mcp/${serverSlug}`
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body;
};

export const callRuntime = async (
  app: FastifyInstance,
  session: AdminSession,
  body: Record<string, unknown>,
  serverSlug = "public-runtime-server",
  token?: string
) => {
  const result = await request(app, {
    method: "POST",
    url: `/mcp/${serverSlug}`,
    payload: body,
    headers: {
      accept: "application/json, text/event-stream",
      ...(token
        ? {
            authorization: `Bearer ${token}`
          }
        : {})
    }
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body;
};

export const callRuntimeRaw = async (
  app: FastifyInstance,
  session: AdminSession,
  {
    method = "POST",
    body,
    serverSlug = "public-runtime-server",
    token
  }: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    serverSlug?: string;
    token?: string;
  }
) => request(app, {
  method,
  url: `/mcp/${serverSlug}`,
  payload: body,
  headers: {
    accept: method === "POST" ? "application/json, text/event-stream" : "text/event-stream",
    ...(token
      ? {
          authorization: `Bearer ${token}`
        }
      : {})
  }
});

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

export const upsertAuthServerConfig = async (
  app: FastifyInstance,
  session: AdminSession,
  payload: {
    issuer: string;
    jwksUri: string;
    tokenEndpoint?: string;
    clientId?: string;
    clientSecret?: string;
  }
) => {
  const result = await request(app, {
    method: "PUT",
    url: "/api/admin/v1/security/auth-server",
    token: session.token,
    payload
  });
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.body.data;
};
