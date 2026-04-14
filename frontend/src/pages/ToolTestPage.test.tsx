import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import ToolTestPage from "@/pages/ToolTestPage";
import { setStoredSession } from "@/lib/auth";
import { setStoredMcpTestToken } from "@/lib/mcp-test-token";
import { buildStoredSession } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

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

describe("ToolTestPage", () => {
  it("navigates back to the tool detail page", async () => {
    navigateMock.mockReset();
    setStoredSession(buildStoredSession());

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/tools/tool-1")) {
        return Response.json({
          data: {
            id: "tool-1",
            mcpServerId: "server-1",
            name: "getpost",
            slug: "getpost",
            title: "Get post",
            description: null,
            inputSchema: null,
            outputSchema: null,
            examples: null,
            riskLevel: "low",
            scopeIds: [],
            mapping: null,
            isActive: true
          }
        });
      }
      if (url.includes("/mcp-servers")) {
        return Response.json(buildPaginated([
          {
            id: "server-1",
            organizationId: "org-1",
            name: "Posts Server",
            slug: "posts-server",
            version: "1.0.0",
            description: null,
            authMode: "local",
            accessMode: "public",
            audience: null,
            isActive: true
          }
        ]));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/mcp-servers/:serverId/tools/:toolId/test" element={<ToolTestPage />} />
      </Routes>,
      {
        route: "/mcp-servers/server-1/tools/tool-1/test"
      }
    );

    expect(await screen.findByRole("button", { name: "Back" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigateMock).toHaveBeenCalledWith("/mcp-servers/server-1/tools/tool-1");
  });

  it("prefills the request body from the tool schema and renders runtime responses", async () => {
    navigateMock.mockReset();
    setStoredSession(buildStoredSession());

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/tools/tool-1")) {
        return Response.json({
          data: {
            id: "tool-1",
            mcpServerId: "server-1",
            name: "getpost",
            slug: "getpost",
            title: "Get post",
            description: null,
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "integer" },
                verbose: { type: "boolean" }
              }
            },
            outputSchema: null,
            examples: null,
            riskLevel: "low",
            scopeIds: [],
            mapping: null,
            isActive: true
          }
        });
      }
      if (url.includes("/mcp-servers")) {
        return Response.json(buildPaginated([
          {
            id: "server-1",
            organizationId: "org-1",
            name: "Posts Server",
            slug: "posts-server",
            version: "1.0.0",
            description: null,
            authMode: "local",
            accessMode: "public",
            audience: null,
            isActive: true
          }
        ]));
      }
      if (url === "http://localhost:3000/mcp/posts-server") {
        return new Response(
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
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/mcp-servers/:serverId/tools/:toolId/test" element={<ToolTestPage />} />
      </Routes>,
      {
        route: "/mcp-servers/server-1/tools/tool-1/test"
      }
    );

    const requestBody = await screen.findByLabelText(/Request Body/i);
    await waitFor(() => {
      expect((requestBody as HTMLTextAreaElement).value).toContain('"name": "getpost"');
      expect((requestBody as HTMLTextAreaElement).value).toContain('"id": 0');
      expect((requestBody as HTMLTextAreaElement).value).toContain('"verbose": false');
    });

    fireEvent.click(screen.getByRole("button", { name: "Run Tool Test" }));

    expect(await screen.findByDisplayValue(/"text": "ok"/)).toBeInTheDocument();
  });

  it("reuses a stored OAuth access token for protected tool tests", async () => {
    navigateMock.mockReset();
    setStoredSession(buildStoredSession());
    localStorage.setItem("rest-to-mcp.mcp-test-token.server-1", "stored-oauth-token");

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/tools/tool-1")) {
        return Response.json({
          data: {
            id: "tool-1",
            mcpServerId: "server-1",
            name: "getpost",
            slug: "getpost",
            title: "Get post",
            description: null,
            inputSchema: null,
            outputSchema: null,
            examples: null,
            riskLevel: "low",
            scopeIds: [],
            mapping: null,
            isActive: true
          }
        });
      }
      if (url.includes("/mcp-servers")) {
        return Response.json(buildPaginated([
          {
            id: "server-1",
            organizationId: "org-1",
            name: "Posts Server",
            slug: "posts-server",
            version: "1.0.0",
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
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          result: {
            content: [{ type: "text", text: "protected-ok" }],
            isError: false
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
        <Route path="/mcp-servers/:serverId/tools/:toolId/test" element={<ToolTestPage />} />
      </Routes>,
      {
        route: "/mcp-servers/server-1/tools/tool-1/test"
      }
    );

    expect(await screen.findByDisplayValue("stored-oauth-token")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run Tool Test" }));

    expect(await screen.findByDisplayValue(/"protected-ok"/)).toBeInTheDocument();
  });

  it("shows JSON parse errors in the response field", async () => {
    navigateMock.mockReset();
    setStoredSession(buildStoredSession());

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/tools/tool-1")) {
        return Response.json({
          data: {
            id: "tool-1",
            mcpServerId: "server-1",
            name: "getpost",
            slug: "getpost",
            title: "Get post",
            description: null,
            inputSchema: null,
            outputSchema: null,
            examples: null,
            riskLevel: "low",
            scopeIds: [],
            mapping: null,
            isActive: true
          }
        });
      }
      if (url.includes("/mcp-servers")) {
        return Response.json(buildPaginated([
          {
            id: "server-1",
            organizationId: "org-1",
            name: "Posts Server",
            slug: "posts-server",
            version: "1.0.0",
            description: null,
            authMode: "local",
            accessMode: "public",
            audience: null,
            isActive: true
          }
        ]));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/mcp-servers/:serverId/tools/:toolId/test" element={<ToolTestPage />} />
      </Routes>,
      {
        route: "/mcp-servers/server-1/tools/tool-1/test"
      }
    );

    const requestBody = await screen.findByLabelText(/Request Body/i);
    fireEvent.change(requestBody, {
      target: { value: "{not valid json" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Tool Test" }));

    expect(await screen.findByDisplayValue(/Expected property name or '\}'/)).toBeInTheDocument();
  });

  it("reuses the saved test OAuth token for protected server tool calls", async () => {
    navigateMock.mockReset();
    setStoredSession(buildStoredSession());
    setStoredMcpTestToken("server-1", "saved-runtime-token");

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/tools/tool-1")) {
        return Response.json({
          data: {
            id: "tool-1",
            mcpServerId: "server-1",
            name: "getpost",
            slug: "getpost",
            title: "Get post",
            description: null,
            inputSchema: null,
            outputSchema: null,
            examples: null,
            riskLevel: "low",
            scopeIds: [],
            mapping: null,
            isActive: true
          }
        });
      }
      if (url.includes("/mcp-servers")) {
        return Response.json(buildPaginated([
          {
            id: "server-1",
            organizationId: "org-1",
            name: "Posts Server",
            slug: "posts-server",
            version: "1.0.0",
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
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          result: {
            content: [{ type: "text", text: "ok" }],
            isError: false
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/mcp-servers/:serverId/tools/:toolId/test" element={<ToolTestPage />} />
      </Routes>,
      {
        route: "/mcp-servers/server-1/tools/tool-1/test"
      }
    );

    expect(await screen.findByDisplayValue("saved-runtime-token")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run Tool Test" }));

    expect(await screen.findByDisplayValue(/"text": "ok"/)).toBeInTheDocument();
  });
});
