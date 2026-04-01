import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import McpServerTestPage from "@/pages/McpServerTestPage";
import { setStoredSession } from "@/lib/auth";
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
  it("shows the bearer token field for protected servers and renders initialize responses", async () => {
    setStoredSession(buildStoredSession());

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
      if (url.includes("/organizations")) {
        return Response.json(buildPaginated([
          {
            id: "org-1",
            name: "Default Org",
            slug: "default"
          }
        ]));
      }
      if (url === "http://localhost:3000/mcp/default/posts-server") {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer runtime-token");
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

    expect(await screen.findByDisplayValue("http://localhost:3000/mcp/default/posts-server")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Bearer Token/i), {
      target: { value: "runtime-token" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Test Initialize" }));

    expect(await screen.findByDisplayValue(/Posts Server/)).toBeInTheDocument();
  });
});
