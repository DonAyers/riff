import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingSheet, hasSeenOnboarding } from "./OnboardingSheet";

describe("OnboardingSheet", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the close button visible in the help surface", () => {
    render(<OnboardingSheet onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: /close/i })).toBeVisible();
  });

  it("marks onboarding as seen when dismissed", () => {
    const onClose = vi.fn();

    render(<OnboardingSheet onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));

    expect(hasSeenOnboarding()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
