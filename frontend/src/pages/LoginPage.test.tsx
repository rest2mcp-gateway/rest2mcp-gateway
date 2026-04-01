import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import {
  ACCESS_TOKEN_STORAGE_KEY,
  ENV_CONFIG_STORAGE_KEY,
  USER_STORAGE_KEY
} from "@/lib/auth";
import { renderWithProviders } from "@/test/render";

describe("LoginPage", () => {
  it("renders username login and navigates after successful sign-in", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return new Response(
          JSON.stringify({
            data: {
              token: "token-123",
              user: {
                id: "user-1",
                organizationId: "org-1",
                username: "admin",
                name: "Admin",
                role: "admin",
                authMode: "local",
                isActive: true
              },
              env_config: {
                autoPublishDrafts: true,
                mode: "development"
              }
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Dashboard Home</div>} />
      </Routes>,
      {
        route: "/login",
      }
    );

    expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Email/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: "admin" }
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: "secret" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Dashboard Home")).toBeInTheDocument();
    expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe("token-123");
    expect(localStorage.getItem(USER_STORAGE_KEY)).toContain("\"username\":\"admin\"");
    expect(localStorage.getItem(ENV_CONFIG_STORAGE_KEY)).toContain("\"autoPublishDrafts\":true");
  });

  it("shows a login error when authentication fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid credentials" } }), {
        status: 401,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      {
        route: "/login"
      }
    );

    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: "admin" }
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: "wrong" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(/API error 401/i)).toBeInTheDocument();
    });
  });
});
