import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers/runtime-app.js";
import { createStubBackend } from "./helpers/stub-backend.js";
import {
  callRuntime,
  createRuntimeFixture,
  getRuntimeDiscovery,
  loginAsBootstrapAdmin,
  updateToolDescription,
  validateAndPublish
} from "./helpers/workflows.js";

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
        resource: `http://localhost/mcp/${session.organizationSlug}/public-runtime-server`,
        authorization_servers: []
      });

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
              riskLevel: "low"
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
                  message: "Stub backend failed"
                },
                null,
                2
              )
            }
          ],
          structuredContent: {
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
        id: 5,
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
