import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers/runtime-app.js";
import { createStubAuthServer } from "./helpers/stub-auth-server.js";
import { createStubBackend } from "./helpers/stub-backend.js";
import {
  adminRequest,
  callRuntime,
  callRuntimeRaw,
  createRuntimeFixture,
  listExecutionLogs,
  loginAsBootstrapAdmin,
  upsertAuthServerConfig,
  validateAndPublish
} from "./helpers/workflows.js";

test("retries a transient transport failure and succeeds on the next attempt", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      let attempts = 0;
      backend.on("POST", "/widgets/widget-retry", async (request) => {
        attempts += 1;
        if (attempts === 1) {
          return {
            disconnect: true
          };
        }

        return {
          status: 200,
          body: {
            ok: true,
            attempt: attempts,
            echoed: request.bodyJson
          }
        };
      });

      const fixture = await createRuntimeFixture(handle.app, session, backend.baseUrl);
      const updateBackendApi = await adminRequest(handle.app, session, {
        method: "PATCH",
        url: `/api/admin/v1/backend-apis/${fixture.backendApiId}`,
        payload: {
          retryPolicy: { retries: 1 }
        }
      });
      assert.equal(updateBackendApi.response.statusCode, 200, updateBackendApi.response.body);
      await validateAndPublish(handle.app, session);

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-retry",
            name: "Ada",
            count: 2,
            tags: ["retry"]
          }
        }
      });

      assert.equal(attempts, 2);
      assert.equal(backend.requests.length, 2);
      assert.equal(result.result.isError, false);
      assert.deepEqual(result.result.structuredContent, {
        ok: true,
        attempt: 2,
        echoed: {
          message: "hello Ada",
          count: 2,
          tags: ["retry"]
        }
      });
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("exhausts retries after transport failures and records an execution log error", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      backend.on("POST", "/widgets/widget-fail", async () => ({
        disconnect: true
      }));

      const fixture = await createRuntimeFixture(handle.app, session, backend.baseUrl);
      const updateBackendApi = await adminRequest(handle.app, session, {
        method: "PATCH",
        url: `/api/admin/v1/backend-apis/${fixture.backendApiId}`,
        payload: {
          retryPolicy: { retries: 1 }
        }
      });
      assert.equal(updateBackendApi.response.statusCode, 200, updateBackendApi.response.body);
      await validateAndPublish(handle.app, session);

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-fail",
            name: "Grace",
            count: 1,
            tags: []
          }
        }
      });

      assert.equal(backend.requests.length, 2);
      assert.equal(result.result.isError, true);
      assert.match(String(result.result.structuredContent?.error ?? ""), /fetch|socket|network/i);

      const logs = await listExecutionLogs(handle.app, session);
      assert.equal(logs.length, 1);
      assert.equal(logs[0]?.status, "error");
      assert.equal(logs[0]?.backendStatus, null);
      assert.match(String(logs[0]?.errorPayload?.message ?? ""), /fetch|socket|network/i);
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("aborts slow backend calls when a timeout override is configured", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      backend.on("POST", "/widgets/widget-slow", async () => ({
        delayMs: 100,
        status: 200,
        body: {
          ok: true
        }
      }));

      const fixture = await createRuntimeFixture(handle.app, session, backend.baseUrl);
      const updateTool = await adminRequest(handle.app, session, {
        method: "PATCH",
        url: `/api/admin/v1/tools/${fixture.toolId}`,
        payload: {
          mapping: {
            backendResourceId: fixture.backendResourceId,
            requestMapping: {},
            responseMapping: {},
            errorMapping: {},
            authStrategy: "inherit",
            timeoutOverrideMs: 10,
            retryOverride: null,
            isActive: true
          }
        }
      });
      assert.equal(updateTool.response.statusCode, 200, updateTool.response.body);
      await validateAndPublish(handle.app, session);

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-slow",
            name: "Slow",
            count: 1,
            tags: []
          }
        }
      });

      assert.equal(backend.requests.length, 1);
      assert.equal(result.result.isError, true);
      assert.match(String(result.result.structuredContent?.error ?? ""), /abort/i);

      const logs = await listExecutionLogs(handle.app, session);
      assert.equal(logs.length, 1);
      assert.equal(logs[0]?.status, "error");
      assert.equal(logs[0]?.backendStatus, null);
      assert.match(String(logs[0]?.errorPayload?.message ?? ""), /abort/i);
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("returns tool_not_found for unknown runtime tools", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const backend = await createStubBackend();
    try {
      await createRuntimeFixture(handle.app, session, backend.baseUrl);
      await validateAndPublish(handle.app, session);

      const result = await callRuntimeRaw(handle.app, session, {
        body: {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "does_not_exist",
            arguments: {}
          }
        }
      });

      assert.equal(result.response.statusCode, 200, result.response.body);
      assert.equal(result.body.error.code, -32603);
      assert.equal(result.body.error.message, "Tool does_not_exist not found");
    } finally {
      await backend.close();
    }
  } finally {
    await handle.close();
  }
});

test("allows protected runtime calls when scopes are carried in the scp claim", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const authServer = await createStubAuthServer();
    const backend = await createStubBackend();
    try {
      backend.on("POST", "/widgets/widget-scp", async () => ({
        status: 200,
        body: {
          ok: true
        }
      }));

      await upsertAuthServerConfig(handle.app, session, {
        issuer: authServer.issuer,
        jwksUri: authServer.jwksUri
      });
      await createRuntimeFixture(handle.app, session, backend.baseUrl, { authType: "none" }, {
        accessMode: "protected",
        audience: "urn:widgets",
        scopeNames: ["widgets.execute"]
      });
      await validateAndPublish(handle.app, session);

      const token = await authServer.issueToken({
        audience: "urn:widgets",
        extraClaims: {
          scp: ["widgets.execute"]
        }
      });

      const result = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-scp",
            name: "Scopes",
            count: 1,
            tags: []
          }
        }
      }, "public-runtime-server", token);

      assert.equal(result.result.isError, false);
    } finally {
      await backend.close();
      await authServer.close();
    }
  } finally {
    await handle.close();
  }
});

test("rejects protected runtime tokens with issuer or audience mismatches and allows tools without required scopes", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const authServer = await createStubAuthServer();
    const backend = await createStubBackend();
    try {
      backend.on("POST", "/widgets/widget-public-protected", async () => ({
        status: 200,
        body: {
          ok: true
        }
      }));

      await upsertAuthServerConfig(handle.app, session, {
        issuer: authServer.issuer,
        jwksUri: authServer.jwksUri
      });
      await createRuntimeFixture(handle.app, session, backend.baseUrl, { authType: "none" }, {
        accessMode: "protected",
        audience: "urn:widgets"
      });
      await validateAndPublish(handle.app, session);

      const wrongAudience = await authServer.issueToken({
        audience: "urn:other"
      });
      const wrongAudienceResult = await callRuntimeRaw(handle.app, session, {
        token: wrongAudience,
        body: {
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: "echo_widget",
            arguments: {
              widgetId: "widget-public-protected",
              name: "Audience",
              count: 1,
              tags: []
            }
          }
        }
      });
      assert.equal(wrongAudienceResult.response.statusCode, 401, wrongAudienceResult.response.body);
      assert.equal(wrongAudienceResult.body.error.code, "runtime_auth_invalid_token");

      const wrongIssuer = await authServer.issueToken({
        issuer: "http://127.0.0.1/other-issuer",
        audience: "urn:widgets"
      });
      const wrongIssuerResult = await callRuntimeRaw(handle.app, session, {
        token: wrongIssuer,
        body: {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: {
            name: "echo_widget",
            arguments: {
              widgetId: "widget-public-protected",
              name: "Issuer",
              count: 1,
              tags: []
            }
          }
        }
      });
      assert.equal(wrongIssuerResult.response.statusCode, 401, wrongIssuerResult.response.body);
      assert.equal(wrongIssuerResult.body.error.code, "runtime_auth_invalid_token");

      const validToken = await authServer.issueToken({
        audience: "urn:widgets"
      });
      const success = await callRuntime(handle.app, session, {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: {
          name: "echo_widget",
          arguments: {
            widgetId: "widget-public-protected",
            name: "NoScopeNeeded",
            count: 1,
            tags: []
          }
        }
      }, "public-runtime-server", validToken);
      assert.equal(success.result.isError, false);
    } finally {
      await backend.close();
      await authServer.close();
    }
  } finally {
    await handle.close();
  }
});
