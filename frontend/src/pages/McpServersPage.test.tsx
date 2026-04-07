import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import McpServersPage from "@/pages/McpServersPage";
import { setStoredSession } from "@/lib/auth";
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

describe("McpServersPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    setStoredSession(buildStoredSession());
  });

  it("shows test actions for servers and tools from the non-edit list page", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
            accessMode: "public",
            audience: null,
            isActive: true
          }
        ]));
      }

      if (url.includes("/tools") && url.includes("mcpServerId=server-1")) {
        return Response.json(buildPaginated([
          {
            id: "tool-1",
            mcpServerId: "server-1",
            name: "list_posts",
            slug: "list-posts",
            title: "List Posts",
            description: "Returns posts",
            inputSchema: {},
            outputSchema: {},
            examples: [],
            riskLevel: "low",
            isActive: true,
            scopeIds: [],
            mapping: null
          }
        ]));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<McpServersPage />);

    expect(await screen.findByRole("button", { name: "Test MCP" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Test MCP" }));
    expect(navigateMock).toHaveBeenCalledWith("/mcp-servers/server-1/test");

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(navigateMock).toHaveBeenCalledWith("/mcp-servers/server-1/tools/tool-1/test");
  });
});
