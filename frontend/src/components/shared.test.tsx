import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MethodBadge, PaginationControls, StatusBadge } from "@/components/shared";

describe("shared components", () => {
  it("renders active and inactive status badges", () => {
    const { rerender } = render(<StatusBadge active />);
    expect(screen.getByText("Active")).toBeInTheDocument();

    rerender(<StatusBadge active={false} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("renders the HTTP method badge", () => {
    render(<MethodBadge method="DELETE" />);
    expect(screen.getByText("DELETE")).toBeInTheDocument();
  });

  it("invokes pagination callbacks", () => {
    const onPageChange = vi.fn();

    render(
      <PaginationControls
        pagination={{
          page: 2,
          pageSize: 10,
          total: 25,
          pageCount: 3
        }}
        onPageChange={onPageChange}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: /Previous/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("link", { name: /Next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
