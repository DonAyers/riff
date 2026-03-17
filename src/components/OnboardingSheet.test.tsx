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

  it("adds the export reminder when storage is more likely to clear out", () => {
    render(<OnboardingSheet onClose={vi.fn()} showStorageHint />);

    expect(
      screen.getByText(/saved riffs can clear out when your device needs space/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/export the ones you want to keep/i)).toBeInTheDocument();
  });

  it("shows the keyboard shortcut help block", () => {
    render(<OnboardingSheet onClose={vi.fn()} />);

    expect(screen.getByText(/keyboard shortcuts/i)).toBeInTheDocument();
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.getByText(/start or stop recording/i)).toBeInTheDocument();
    expect(screen.getByText(/jump to the export buttons/i)).toBeInTheDocument();
  });
});
