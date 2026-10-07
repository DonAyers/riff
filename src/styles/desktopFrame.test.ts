import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const cssFiles = ["src/styles", "src/components"].flatMap((dir) =>
  readdirSync(path.join(root, dir))
    .filter((name) => name.endsWith(".css"))
    .map((name) => path.join(dir, name))
    // index.css defines the frame itself from the real viewport.
    .filter((file) => file !== path.join("src/styles", "index.css"))
);

describe("desktop phone frame", () => {
  it("wraps the React root in the app frame", () => {
    const html = readFileSync(path.join(root, "index.html"), "utf-8");
    expect(html).toMatch(/<div class="app-frame">\s*<div id="root"><\/div>\s*<\/div>/);
  });

  // The frame is the layout's container, so width breakpoints and viewport
  // units must measure it, not the browser window.
  it.each(cssFiles)("%s sizes against the app container, not the viewport", (file) => {
    const css = readFileSync(path.join(root, file), "utf-8");
    // ChordMapExplorer pairs its narrow layout with a height query and the frame width.
    if (!file.endsWith("ChordMapExplorer.css")) {
      expect(css).not.toMatch(/@media[^{]*\b(?:min|max)-width/);
    }
    expect(css).not.toMatch(/\d(?:d|s|l)?vw\b/);
    expect(css).not.toMatch(/100(?:d|s|l)?vh\b/);
  });
});
