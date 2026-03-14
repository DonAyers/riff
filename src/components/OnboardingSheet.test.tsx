import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLabel } from "../lib/buildInfo";
import { OnboardingSheet, hasSeenOnboarding } from "./OnboardingSheet";

describe("OnboardingSheet", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows build info in the help surface", () => {
    render(<OnboardingSheet onClose={vi.fn()} />);

    expect(screen.getByText(/about this build/i)).toBeInTheDocument();
    expect(screen.getByText(buildLabel)).toBeInTheDocument();
  });

  it("marks onboarding as seen when dismissed", () => {
    const onClose = vi.fn();

    render(<OnboardingSheet onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));

    expect(hasSeenOnboarding()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
