import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppTabBar } from "./AppTabBar";

describe("AppTabBar", () => {
  it("renders every primary destination and marks the active one", () => {
    render(<AppTabBar activeTab="tuner" navigate={vi.fn()} />);

    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Record" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Builder" })).toHaveAttribute("href", "/builder");
    expect(screen.getByRole("link", { name: "Tuner" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Record" })).not.toHaveAttribute("aria-current");
  });

  it("navigates in-app on a plain click", () => {
    const navigate = vi.fn();
    render(<AppTabBar activeTab="home" navigate={navigate} />);

    fireEvent.click(screen.getByRole("link", { name: "Builder" }));

    expect(navigate).toHaveBeenCalledWith("/builder");
  });

  it("leaves modified clicks to the browser", () => {
    const navigate = vi.fn();
    render(<AppTabBar activeTab="home" navigate={navigate} />);

    fireEvent.click(screen.getByRole("link", { name: "Tuner" }), { metaKey: true });

    expect(navigate).not.toHaveBeenCalled();
  });
});
