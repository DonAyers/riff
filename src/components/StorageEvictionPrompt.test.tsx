import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StorageEvictionPrompt } from "./StorageEvictionPrompt";

describe("StorageEvictionPrompt", () => {
  it("renders a calm export reminder", () => {
    render(<StorageEvictionPrompt />);

    expect(screen.getByRole("note", { name: /export reminder/i })).toBeInTheDocument();
    expect(screen.getByText(/keep important riffs safe/i)).toBeInTheDocument();
    expect(
      screen.getByText(/saved riffs can clear out on this browser/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/export any riff you want to keep/i)).toBeInTheDocument();
  });
});
