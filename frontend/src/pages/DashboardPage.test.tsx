import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "@/pages/DashboardPage";
import { setStoredSession } from "@/lib/auth";
import { buildStoredSession } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

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

describe("DashboardPage", () => {
  it("shows the development auto-publish state from backend env config", async () => {
    setStoredSession(buildStoredSession({
      envConfig: {
        autoPublishDrafts: true,
        mode: "development"
      }
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/backend-apis")) {
        return Response.json(buildPaginated([
          {
            id: "api-1",
            organizationId: "org-1",
            name: "Posts API",
            slug: "posts-api",
            description: null,
            defaultBaseUrl: "https://example.test",
            authType: "none",
            authConfig: {},
            defaultTimeoutMs: 5000,
            retryPolicy: { retries: 0 },
            isActive: true
          }
        ]));
      }
      if (url.includes("/mcp-servers")) {
        return Response.json(buildPaginated([]));
      }
      if (url.includes("/scopes")) {
        return Response.json(buildPaginated([]));
      }
      if (url.includes("/tools")) {
        return Response.json(buildPaginated([]));
      }
      if (url.includes("/config/validate/")) {
        return Response.json({
          data: {
            valid: false,
            issues: ["At least one MCP server is required"]
          }
        });
      }
      if (url.includes("/config/snapshots/")) {
        return Response.json({ data: [] });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText("Development Auto-Publish")).toBeInTheDocument();
    expect(
      screen.getByText("Create an MCP server first, then add at least one tool and mapping before publishing.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto-Publish Enabled" })).toBeDisabled();
    expect(screen.getByLabelText("Publish Notes")).toBeDisabled();
  });

  it("shows a normal publish action when auto-publish is disabled", async () => {
    setStoredSession(buildStoredSession({
      envConfig: {
        autoPublishDrafts: false,
        mode: "production"
      }
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/backend-apis")) {
        return Response.json(buildPaginated([]));
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
      if (url.includes("/scopes")) {
        return Response.json(buildPaginated([]));
      }
      if (url.includes("/tools")) {
        return Response.json(buildPaginated([]));
      }
      if (url.includes("/config/validate/")) {
        return Response.json({
          data: {
            valid: true,
            issues: []
          }
        });
      }
      if (url.includes("/config/snapshots/")) {
        return Response.json({ data: [] });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole("button", { name: "Publish Snapshot" })).toBeEnabled();
    expect(screen.getByText("Draft is valid and ready to publish.")).toBeInTheDocument();
    expect(screen.queryByText("Development Auto-Publish")).not.toBeInTheDocument();
  });
});
