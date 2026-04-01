import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAuth } from "@/providers/AuthProvider";
import { emitUnauthorizedEvent, setStoredSession } from "@/lib/auth";
import { buildStoredSession } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const AuthProbe = () => {
  const { isAuthenticated, user, envConfig } = useAuth();

  return (
    <div>
      <span data-testid="auth-state">{isAuthenticated ? "authenticated" : "anonymous"}</span>
      <span data-testid="username">{user?.username ?? "none"}</span>
      <span data-testid="auto-publish">{String(envConfig?.autoPublishDrafts ?? false)}</span>
    </div>
  );
};

describe("AuthProvider", () => {
  it("restores the stored session including env config", () => {
    setStoredSession(buildStoredSession({
      user: {
        id: "user-2",
        organizationId: "org-1",
        username: "ops-admin",
        name: "Ops Admin",
        role: "admin",
        authMode: "local",
        isActive: true
      },
      envConfig: {
        autoPublishDrafts: true,
        mode: "development"
      }
    }));

    renderWithProviders(<AuthProbe />);

    expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("username")).toHaveTextContent("ops-admin");
    expect(screen.getByTestId("auto-publish")).toHaveTextContent("true");
  });

  it("clears the session when an unauthorized event is emitted", async () => {
    setStoredSession(buildStoredSession());

    renderWithProviders(<AuthProbe />);
    expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated");

    act(() => {
      emitUnauthorizedEvent();
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("anonymous");
    });
    expect(screen.getByTestId("username")).toHaveTextContent("none");
  });
});
