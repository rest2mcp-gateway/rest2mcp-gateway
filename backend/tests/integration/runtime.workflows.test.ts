import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createTestApp, getTestAppBaseUrl } from "./helpers/runtime-app.js";
import { createStubBackend } from "./helpers/stub-backend.js";
import { createStubAuthServer } from "./helpers/stub-auth-server.js";
import {
  callRuntime,
  callRuntimeRaw,
  createRuntimeFixture,
  getRuntimeDiscovery,
  loginAsBootstrapAdmin,
  upsertAuthServerConfig,
  updateToolDescription,
  validateAndPublish
} from "./helpers/workflows.js";

const getResourceMetadataUrl = (wwwAuthenticateHeader: string | undefined) => {
  const match = wwwAuthenticateHeader?.match(/resource_metadata="([^"]+)"/);
  assert.ok(match?.[1], `Expected resource_metadata in WWW-Authenticate header, got: ${wwwAuthenticateHeader ?? "<missing>"}`);
  return match[1];
};

const getRuntimeResourceUrl = (app: Parameters<typeof getTestAppBaseUrl>[0], serverSlug = "public-runtime-server") =>
  `${getTestAppBaseUrl(app)}/mcp/${serverSlug}`;

test("publishes a minimal public runtime and exposes discovery plus tools/list", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      await createRuntimeFixture(handle.app, session, backend.baseUrl);
      await validateAndPublish(handle.app, session);

      const discovery = await getRuntimeDiscovery(handle.app, session);
      assert.deepEqual(discovery, {
        resource: getRuntimeResourceUrl(handle.app),
        authorization_servers: []
      });

      const initialize = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize"
      });
      assert.equal(initialize.jsonrpc, "2.0");
      assert.equal(initialize.id, 1);

      const toolsList = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list"
      });
      assert.deepEqual(toolsList.result, {
        tools: [
          {
            name: "echo_widget",
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
            annotations: {
              riskLevel: "low",
              scopes: []
            }
          }
        ]
      });
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("executes a runtime tool call against the stub backend", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      backend.on("POST", "/widgets/widget-42", async (request) => ({
        status: 200,
        body: {
          ok: true,
          echoed: request.bodyJson
        }
      }));

      await createRuntimeFixture(handle.app, session, backend.baseUrl);
      await validateAndPublish(handle.app, session);

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-42",
            name: "Ada",
            count: 2,
            tags: ["alpha", "beta"]
          }
        }
      });

      assert.equal(backend.requests.length, 1);
      assert.equal(backend.requests[0]?.method, "POST");
      assert.equal(backend.requests[0]?.path, "/widgets/widget-42");
      assert.equal(
        backend.requests[0]?.bodyText,
        "{\"message\":\"hello Ada\",\"count\":2,\"tags\":[\"alpha\",\"beta\"]}"
      );
      assert.deepEqual(backend.requests[0]?.bodyJson, {
        message: "hello Ada",
        count: 2,
        tags: ["alpha", "beta"]
      });
      assert.equal(backend.requests[0]?.headers.accept, "application/json");
      assert.equal(backend.requests[0]?.headers["content-type"], "application/json");

      assert.deepEqual(result.result, {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                echoed: {
                  message: "hello Ada",
                  count: 2,
                  tags: ["alpha", "beta"]
                }
              },
              null,
              2
            )
          }
        ],
        structuredContent: {
          ok: true,
          echoed: {
            message: "hello Ada",
            count: 2,
            tags: ["alpha", "beta"]
          }
        },
        isError: false
      });
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("returns runtime tool errors from backend failure responses", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      backend.on("POST", "/widgets/widget-99", async () => ({
        status: 502,
        body: {
          error: "backend_unavailable",
          message: "Stub backend failed"
        }
      }));

      await createRuntimeFixture(handle.app, session, backend.baseUrl);
      await validateAndPublish(handle.app, session);

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-99",
            name: "Grace",
            count: 1,
            tags: []
          }
        }
      });

      assert.deepEqual(result, {
        jsonrpc: "2.0",
        id: 4,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: "backend_unavailable",
                  message: "Stub backend failed",
                  status: 502
                },
                null,
                2
              )
            }
          ],
          structuredContent: {
            status: 502,
            error: "backend_unavailable",
            message: "Stub backend failed"
          },
          isError: true
        }
      });
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("returns explicit fallback MCP tool errors for empty backend 404 responses", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      backend.on("POST", "/widgets/widget-missing", async () => ({
        status: 404,
        body: {}
      }));

      await createRuntimeFixture(handle.app, session, backend.baseUrl);
      await validateAndPublish(handle.app, session);

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-missing",
            name: "Missing",
            count: 1,
            tags: []
          }
        }
      });

      assert.deepEqual(result, {
        jsonrpc: "2.0",
        id: 5,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: 404,
                  error: "backend_not_found",
                  message: "Backend returned 404 Not Found"
                },
                null,
                2
              )
            }
          ],
          structuredContent: {
            status: 404,
            error: "backend_not_found",
            message: "Backend returned 404 Not Found"
          },
          isError: true
        }
      });
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("wraps array backend responses in structuredContent for MCP compatibility", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      const posts = [
        { id: 1, title: "first post" },
        { id: 2, title: "second post" }
      ];

      backend.on("POST", "/widgets/widget-list", async () => ({
        status: 200,
        body: posts
      }));

      await createRuntimeFixture(handle.app, session, backend.baseUrl);
      await validateAndPublish(handle.app, session);

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-list",
            name: "List",
            count: 2,
            tags: []
          }
        }
      });

      assert.deepEqual(result, {
        jsonrpc: "2.0",
        id: 6,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(posts, null, 2)
            }
          ],
          structuredContent: {
            items: posts
          },
          isError: false
        }
      });
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("wraps array backend error responses in structuredContent for MCP compatibility", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      const errors = [
        { error: "invalid_post" },
        { error: "missing_author" }
      ];

      backend.on("POST", "/widgets/widget-list-error", async () => ({
        status: 400,
        body: errors
      }));

      await createRuntimeFixture(handle.app, session, backend.baseUrl);
      await validateAndPublish(handle.app, session);

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-list-error",
            name: "List",
            count: 2,
            tags: []
          }
        }
      });

      assert.deepEqual(result, {
        jsonrpc: "2.0",
        id: 7,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: 400,
                  error: "backend_bad_request",
                  message: "Backend returned 400 Bad Request",
                  details: errors
                },
                null,
                2
              )
            }
          ],
          structuredContent: {
            status: 400,
            error: "backend_bad_request",
            message: "Backend returned 400 Bad Request",
            details: errors
          },
          isError: true
        }
      });
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("executes a runtime tool call against an API-key protected backend", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      backend.onApiKeyProtected(
        "POST",
        "/widgets/widget-api-key",
        {
          in: "header",
          name: "x-api-key",
          value: "stub-secret-key"
        },
        async (request) => ({
          status: 200,
          body: {
            ok: true,
            authorized: true,
            echoed: request.bodyJson
          }
        })
      );

      await createRuntimeFixture(handle.app, session, backend.baseUrl, {
        authType: "api_key",
        apiKeyLocation: "header",
        apiKeyName: "x-api-key",
        apiKeyValue: "stub-secret-key"
      });
      await validateAndPublish(handle.app, session);

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-api-key",
            name: "Lin",
            count: 3,
            tags: ["secure"]
          }
        }
      });

      assert.equal(backend.requests.length, 1);
      assert.equal(backend.requests[0]?.headers["x-api-key"], "stub-secret-key");
      assert.deepEqual(result.result, {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                authorized: true,
                echoed: {
                  message: "hello Lin",
                  count: 3,
                  tags: ["secure"]
                }
              },
              null,
              2
            )
          }
        ],
        structuredContent: {
          ok: true,
          authorized: true,
          echoed: {
            message: "hello Lin",
            count: 3,
            tags: ["secure"]
          }
        },
        isError: false
      });
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("executes a runtime tool call against a query-api-key protected backend", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      backend.onApiKeyProtected(
        "POST",
        "/widgets/widget-query-key",
        {
          in: "query",
          name: "api_key",
          value: "stub-query-key"
        },
        async (request) => ({
          status: 200,
          body: {
            ok: true,
            authorized: true,
            query: request.query,
            echoed: request.bodyJson
          }
        })
      );

      await createRuntimeFixture(handle.app, session, backend.baseUrl, {
        authType: "api_key",
        apiKeyLocation: "query",
        apiKeyName: "api_key",
        apiKeyValue: "stub-query-key"
      });
      await validateAndPublish(handle.app, session);

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-query-key",
            name: "Query",
            count: 7,
            tags: ["query-auth"]
          }
        }
      });

      assert.equal(backend.requests.length, 1);
      assert.equal(backend.requests[0]?.query.api_key, "stub-query-key");
      assert.deepEqual(result.result, {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                authorized: true,
                query: {
                  api_key: "stub-query-key"
                },
                echoed: {
                  message: "hello Query",
                  count: 7,
                  tags: ["query-auth"]
                }
              },
              null,
              2
            )
          }
        ],
        structuredContent: {
          ok: true,
          authorized: true,
          query: {
            api_key: "stub-query-key"
          },
          echoed: {
            message: "hello Query",
            count: 7,
            tags: ["query-auth"]
          }
        },
        isError: false
      });
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("serves a protected MCP runtime and validates bearer tokens against a stub JWKS server", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    const authServer = await createStubAuthServer();
    try {
      backend.on("POST", "/widgets/widget-oauth", async (request) => ({
        status: 200,
        body: {
          ok: true,
          protected: true,
          echoed: request.bodyJson
        }
      }));

      await upsertAuthServerConfig(handle.app, session, {
        issuer: authServer.issuer,
        jwksUri: authServer.jwksUri
      });

      const fixture = await createRuntimeFixture(
        handle.app,
        session,
        backend.baseUrl,
        { authType: "none" },
        {
          accessMode: "protected",
          audience: "protected-runtime-audience",
          scopeNames: ["widgets.read"]
        }
      );
      assert.equal(fixture.scopeIds.length, 1);

      await validateAndPublish(handle.app, session);

      const discovery = await getRuntimeDiscovery(handle.app, session);
      assert.deepEqual(discovery, {
        resource: getRuntimeResourceUrl(handle.app),
        authorization_servers: [authServer.issuer],
        resource_name: "Public Runtime Server",
        scopes_supported: ["widgets.read"]
      });

      const unauthorized = await callRuntimeRaw(handle.app, session, {
        body: {
          jsonrpc: "2.0",
          id: 7,
          method: "initialize"
        }
      });
      assert.equal(unauthorized.response.statusCode, 401);
      assert.deepEqual(unauthorized.body, {
        error: {
          code: "runtime_auth_missing_token",
          message: "Missing bearer token"
        }
      });
      assert.match(
        String(unauthorized.response.headers["www-authenticate"] ?? ""),
        /resource_metadata=/
      );

      const metadataUrl = getResourceMetadataUrl(
        typeof unauthorized.response.headers["www-authenticate"] === "string"
          ? unauthorized.response.headers["www-authenticate"]
          : undefined
      );
      const metadataResponse = await fetch(metadataUrl);
      assert.equal(metadataResponse.status, 200);
      assert.deepEqual(await metadataResponse.json(), {
        resource: getRuntimeResourceUrl(handle.app),
        authorization_servers: [authServer.issuer],
        resource_name: "Public Runtime Server",
        scopes_supported: ["widgets.read"]
      });

      const accessToken = await authServer.issueToken({
        audience: "protected-runtime-audience",
        scope: "widgets.read"
      });

      const authorizedInitialize = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 8,
        method: "initialize"
      }, "public-runtime-server", accessToken);
      assert.equal(authorizedInitialize.jsonrpc, "2.0");
      assert.equal(authorizedInitialize.id, 8);

      const unauthorizedToolsList = await callRuntimeRaw(handle.app, session, {
        body: {
          jsonrpc: "2.0",
          id: 9,
          method: "tools/list"
        }
      });
      assert.equal(unauthorizedToolsList.response.statusCode, 401);
      assert.deepEqual(unauthorizedToolsList.body, {
        error: {
          code: "runtime_auth_missing_token",
          message: "Missing bearer token"
        }
      });
      assert.match(
        String(unauthorizedToolsList.response.headers["www-authenticate"] ?? ""),
        /resource_metadata=/
      );

      const insufficientScopeToken = await authServer.issueToken({
        audience: "protected-runtime-audience",
        scope: "widgets.write"
      });

      const toolsList = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/list"
      }, "public-runtime-server", accessToken);
      assert.equal(toolsList.result.tools[0]?.name, "echo_widget");
      assert.deepEqual(toolsList.result.tools[0]?.annotations, {
        riskLevel: "low",
        scopes: ["widgets.read"]
      });

      const insufficientScope = await callRuntimeRaw(handle.app, session, {
        body: {
          jsonrpc: "2.0",
          id: 11,
          method: "tools/call",
          params: {
            name: "echo_widget",
            arguments: {
              widgetId: "widget-oauth",
              name: "OAuth",
              count: 1,
              tags: ["widgets.read"]
            }
          }
        },
        token: insufficientScopeToken
      });
      assert.equal(insufficientScope.response.statusCode, 403);
      assert.deepEqual(insufficientScope.body, {
        error: {
          code: "runtime_auth_insufficient_scope",
          message: "Missing required scopes: widgets.read"
        }
      });
      assert.match(
        String(insufficientScope.response.headers["www-authenticate"] ?? ""),
        /insufficient_scope/
      );

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-oauth",
            name: "OAuth",
            count: 1,
            tags: ["widgets.read"]
          }
        }
      }, "public-runtime-server", accessToken);

      assert.equal(backend.requests.length, 1);
      assert.deepEqual(result.result, {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                protected: true,
                echoed: {
                  message: "hello OAuth",
                  count: 1,
                  tags: ["widgets.read"]
                }
              },
              null,
              2
            )
          }
        ],
        structuredContent: {
          ok: true,
          protected: true,
          echoed: {
            message: "hello OAuth",
            count: 1,
            tags: ["widgets.read"]
          }
        },
        isError: false
      });
    } finally {
      await authServer.close();
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("injects an exchanged bearer token and API key when a backend API enables token exchange", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const authServer = await createStubAuthServer();
    const backend = await createStubBackend();
    try {
      authServer.onTokenExchange((request) => {
        assert.equal(
          request.authorization,
          `Basic ${Buffer.from("gateway-client:gateway-secret").toString("base64")}`
        );
        assert.equal(request.params.grant_type, "urn:ietf:params:oauth:grant-type:token-exchange");
        assert.equal(request.params.subject_token_type, "urn:ietf:params:oauth:token-type:access_token");
        assert.equal(request.params.audience, "urn:widgets-backend");
        assert.equal(request.params.scope, "widgets:read");
        return {
          body: {
            access_token: "downstream-exchanged-token",
            token_type: "Bearer",
            expires_in: 300,
            scope: request.params.scope
          }
        };
      });

      backend.on("POST", "/widgets/widget-token-exchange", async (request) => ({
        status: 200,
        body: {
          ok: true,
          authorization: request.headers.authorization,
          apiKey: request.headers["x-api-key"],
          echoed: request.bodyJson
        }
      }));

      await upsertAuthServerConfig(handle.app, session, {
        issuer: authServer.issuer,
        jwksUri: authServer.jwksUri,
        tokenEndpoint: authServer.tokenEndpoint,
        clientId: "gateway-client",
        clientSecret: "gateway-secret"
      });
      await createRuntimeFixture(handle.app, session, backend.baseUrl, {
        authType: "api_key",
        apiKeyLocation: "header",
        apiKeyName: "x-api-key",
        apiKeyValue: "static-backend-key",
        tokenExchangeEnabled: true,
        tokenExchangeAudience: "urn:widgets-backend"
      }, {
        accessMode: "protected",
        audience: "runtime-test-audience",
        scopeNames: ["widgets:read"]
      });
      await validateAndPublish(handle.app, session);

      const callerToken = await authServer.issueToken({
        audience: "runtime-test-audience",
        scope: "widgets:read",
        subject: "agent-123"
      });

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-token-exchange",
            name: "Token Exchange",
            count: 11,
            tags: ["exchange", "api-key"]
          }
        }
      }, "public-runtime-server", callerToken);

      assert.equal(authServer.tokenExchangeRequests.length, 1);
      assert.equal(authServer.tokenExchangeRequests[0]?.params.subject_token, callerToken);
      assert.equal(backend.requests.length, 1);
      assert.equal(backend.requests[0]?.headers.authorization, "Bearer downstream-exchanged-token");
      assert.equal(backend.requests[0]?.headers["x-api-key"], "static-backend-key");
      assert.deepEqual(result.result.structuredContent, {
        ok: true,
        authorization: "Bearer downstream-exchanged-token",
        apiKey: "static-backend-key",
        echoed: {
          message: "hello Token Exchange",
          count: 11,
          tags: ["exchange", "api-key"]
        }
      });
    } finally {
      await backend.close();
      await authServer.close();
    }
  } finally {
    await handle.close();
  }
});

test("republish refreshes the runtime snapshot used by tools/list", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      const fixture = await createRuntimeFixture(handle.app, session, backend.baseUrl);
      const firstSnapshot = await validateAndPublish(handle.app, session);
      assert.equal(firstSnapshot.version, 1);

      await updateToolDescription(
        handle.app,
        session,
        fixture.toolId,
        "Updated description after republish"
      );

      const secondSnapshot = await validateAndPublish(handle.app, session);
      assert.equal(secondSnapshot.version, 2);

      const toolsList = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/list"
      });

      assert.equal(
        toolsList.result.tools[0]?.description,
        "Updated description after republish"
      );
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});
