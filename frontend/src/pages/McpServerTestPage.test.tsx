import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import McpServerTestPage from "@/pages/McpServerTestPage";
import { setStoredSession } from "@/lib/auth";
import { setStoredMcpTestToken } from "@/lib/mcp-test-token";
import { buildStoredSession } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

const buildPaginated = <T,>(items: T[]) => ({
  data: items,
  meta: {
    pagination: {
      page: 1,
      pageSize: Math.max(items.length, 1),
      total: items.length,
      pageCount: 1
    }
  }
});

describe("McpServerTestPage", () => {
  it("shows the saved OAuth token field for protected servers and renders initialize responses", async () => {
    setStoredSession(buildStoredSession());
    setStoredMcpTestToken("server-1", "saved-runtime-token");

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/mcp-servers")) {
        return Response.json(buildPaginated([
          {
            id: "server-1",
            organizationId: "org-1",
            name: "Posts Server",
            slug: "posts-server",
            version: "1.0.0",
            title: "Posts Server",
            description: null,
            authMode: "local",
            accessMode: "protected",
            audience: "studio",
            isActive: true
          }
        ]));
      }
      if (url === "http://localhost:3000/mcp/posts-server") {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer saved-runtime-token");
        expect(init?.body).toBe(JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "rest-to-mcp-gateway-ui",
              version: "0.1.0"
            }
          }
        }));
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            serverInfo: {
              name: "Posts Server"
            }
          }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/mcp-servers/:id/test" element={<McpServerTestPage />} />
      </Routes>,
      {
        route: "/mcp-servers/server-1/test"
      }
    );

    expect(await screen.findByDisplayValue("http://localhost:3000/mcp/posts-server")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/"method": "initialize"/)
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/"protocolVersion": "2024-11-05"/)
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/"method": "tools\/list"/)
    ).toBeInTheDocument();
    expect(await screen.findByDisplayValue("saved-runtime-token")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Test Initialize" }));

    expect(await screen.findByDisplayValue(/Posts Server/)).toBeInTheDocument();
  });

  it("reuses a stored OAuth access token for tools/list requests", async () => {
    setStoredSession(buildStoredSession());
    setStoredMcpTestToken("server-1", "stored-oauth-token");

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/mcp-servers")) {
        return Response.json(buildPaginated([
          {
            id: "server-1",
            organizationId: "org-1",
            name: "Posts Server",
            slug: "posts-server",
            version: "1.0.0",
            title: "Posts Server",
            description: null,
            authMode: "local",
            accessMode: "protected",
            audience: "studio",
            isActive: true
          }
        ]));
      }
      if (url === "http://localhost:3000/mcp/posts-server") {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer stored-oauth-token");
        expect(init?.body).toBe(JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {}
        }));
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [
              { name: "getpost" }
            ]
          }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/mcp-servers/:id/test" element={<McpServerTestPage />} />
      </Routes>,
      {
        route: "/mcp-servers/server-1/test"
      }
    );

    expect(await screen.findByDisplayValue("stored-oauth-token")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Test List Tools" }));

    expect(await screen.findByDisplayValue(/"getpost"/)).toBeInTheDocument();
  });
});
