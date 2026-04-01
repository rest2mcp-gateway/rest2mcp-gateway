import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  setStoredSession
} from "@/lib/auth";
import { backendApisApi, mcpRuntimeApi } from "@/services/api-client";
import { buildStoredSession } from "@/test/fixtures";

const setStoredUser = () => {
  setStoredSession(buildStoredSession());
};

describe("api-client runtime handling", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("parses normal JSON runtime responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await mcpRuntimeApi.call("org-slug", "server-slug", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize"
    });

    expect(result).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/mcp/org-slug/server-slug",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json"
        })
      })
    );
  });

  it("parses streamable HTTP SSE runtime responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        [
          "event: message",
          'data: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"ok"}],"isError":false}}',
          ""
        ].join("\n"),
        {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await mcpRuntimeApi.call("org-slug", "server-slug", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "echo_widget", arguments: {} }
    });

    expect(result).toEqual({
      jsonrpc: "2.0",
      id: 3,
      result: {
        content: [{ type: "text", text: "ok" }],
        isError: false
      }
    });
  });
});

describe("api-client request headers", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    setStoredUser();
  });

  it("does not send content-type on delete requests with no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "api-1" } }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await backendApisApi.delete("api-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/v1/backend-apis/api-1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token"
        })
      })
    );

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.headers).not.toHaveProperty("Content-Type");
  });
});
