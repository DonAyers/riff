import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("global hidden rule", () => {
  // RiffWorkspace hides the Record screen with the hidden attribute, and .app--flow sets
  // display: grid, which beats the browser's [hidden] rule unless the base CSS forces it.
  it("forces display: none on [hidden] so a class cannot override it", () => {
    const css = readFileSync(path.join(process.cwd(), "src/styles/index.css"), "utf-8");
    expect(css).toMatch(/\[hidden\][^{]*\{\s*display:\s*none\s*!important;\s*\}/);
  });
});
