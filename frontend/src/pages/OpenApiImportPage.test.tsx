import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import OpenApiImportPage from "@/pages/OpenApiImportPage";
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

const baseSpec = `
openapi: 3.0.0
info:
  title: Example API
  version: 1.0.0
paths:
  /posts:
    get:
      summary: List posts
      operationId: listPosts
      responses:
        "200":
          description: ok
`;

describe("OpenApiImportPage", () => {
  it("previews operations and shows unsupported exposure warnings", async () => {
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
            description: null,
            authMode: "local",
            accessMode: "public",
            audience: null,
            isActive: true
          }
        ]));
      }
      if (url.endsWith("/openapi-import/preview")) {
        expect(init?.method).toBe("POST");
        return Response.json({
          data: {
            backendApi: {
              name: "Example API",
              slug: "example-api",
              description: "Imported"
            },
            operations: [
              {
                operationKey: "get /posts",
                operationId: "listPosts",
                method: "GET",
                path: "/posts",
                summary: "List posts",
                description: "",
                exposable: false,
                exposureIssues: ["Query/header/cookie parameters are not auto-exposed yet"],
                suggestedToolName: "listposts",
                suggestedToolSlug: "listposts",
                suggestedToolTitle: "List posts"
              }
            ]
          }
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/backend-apis/import" element={<OpenApiImportPage />} />
      </Routes>,
      {
        route: "/backend-apis/import"
      }
    );

    fireEvent.change(screen.getByRole("textbox", { name: /Name/i }), { target: { value: "Example API" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Base URL/i }), { target: { value: "https://example.test" } });
    fireEvent.change(screen.getByRole("textbox", { name: /OpenAPI Document/i }), { target: { value: baseSpec } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Import" }));

    expect((await screen.findAllByText("List posts")).length).toBeGreaterThan(0);
    expect(
      screen.getByText("Query/header/cookie parameters are not auto-exposed yet")
    ).toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });

  it("keeps import disabled when tools are selected but no MCP target server is chosen", async () => {
    setStoredSession(buildStoredSession());

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
            description: null,
            authMode: "local",
            accessMode: "public",
            audience: null,
            isActive: true
          }
        ]));
      }
      if (url.endsWith("/openapi-import/preview")) {
        return Response.json({
          data: {
            backendApi: {
              name: "Example API",
              slug: "example-api",
              description: "Imported"
            },
            operations: [
              {
                operationKey: "get /posts/{id}",
                operationId: "getPost",
                method: "GET",
                path: "/posts/{id}",
                summary: "Get post",
                description: "",
                exposable: true,
                exposureIssues: [],
                suggestedToolName: "getpost",
                suggestedToolSlug: "getpost",
                suggestedToolTitle: "Get post"
              }
            ]
          }
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/backend-apis/import" element={<OpenApiImportPage />} />
      </Routes>,
      {
        route: "/backend-apis/import"
      }
    );

    fireEvent.change(screen.getByRole("textbox", { name: /Name/i }), { target: { value: "Example API" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Base URL/i }), { target: { value: "https://example.test" } });
    fireEvent.change(screen.getByRole("textbox", { name: /OpenAPI Document/i }), { target: { value: baseSpec } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Import" }));

    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    });
  });
});
