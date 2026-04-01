import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppSidebar } from "@/components/AppSidebar";
import {
  ACCESS_TOKEN_STORAGE_KEY,
  setStoredSession
} from "@/lib/auth";
import { buildStoredSession } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

describe("AppSidebar", () => {
  it("shows navigation and the current username", () => {
    setStoredSession(buildStoredSession({
      user: {
        id: "user-1",
        organizationId: "org-1",
        username: "studio-admin",
        name: "Studio Admin",
        role: "admin",
        authMode: "local",
        isActive: true
      }
    }));

    renderWithProviders(<AppSidebar />);

    expect(screen.getByText("studio-admin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dashboard/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Backend APIs/i })).toHaveAttribute("href", "/backend-apis");
    expect(screen.getByRole("button", { name: /Sign out/i })).toBeInTheDocument();
  });

  it("clears the stored session on sign out", () => {
    setStoredSession(buildStoredSession());

    renderWithProviders(<AppSidebar />);

    fireEvent.click(screen.getByRole("button", { name: /Sign out/i }));

    expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
