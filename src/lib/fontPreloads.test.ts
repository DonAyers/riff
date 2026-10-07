import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getFontPreloadHrefs, PRELOADED_FONTS } from "./fontPreloads";

describe("font preloads", () => {
  it("points at the hashed files in a build", () => {
    const assets = [
      "assets/index-abc.js",
      "assets/silkscreen-latin-400-normal-CtPo2yA5.woff2",
      "assets/vt323-latin-400-normal-wDgJuOC9.woff2",
      "assets/atkinson-hyperlegible-latin-400-normal-BrHNak5F.woff2",
      "assets/atkinson-hyperlegible-latin-400-normal-BbWidj28.woff",
      "assets/atkinson-hyperlegible-latin-700-normal-GZI4o3u0.woff2",
    ];

    expect(getFontPreloadHrefs(assets)).toEqual([
      "/assets/silkscreen-latin-400-normal-CtPo2yA5.woff2",
      "/assets/vt323-latin-400-normal-wDgJuOC9.woff2",
      "/assets/atkinson-hyperlegible-latin-400-normal-BrHNak5F.woff2",
      "/assets/atkinson-hyperlegible-latin-700-normal-GZI4o3u0.woff2",
    ]);
  });

  it("fails the build rather than preloading a font that is not there", () => {
    expect(() => getFontPreloadHrefs(["assets/index-abc.js"])).toThrow(/silkscreen/);
  });

  it("points at the package files in dev", () => {
    expect(getFontPreloadHrefs(null)[0]).toBe(
      "/node_modules/@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2",
    );
  });

  it("preloads exactly the fonts the stylesheet declares", () => {
    const css = readFileSync(path.join(process.cwd(), "src/styles/fonts.css"), "utf-8");
    const declared = [...css.matchAll(/url\(([^)]+)\.woff2\)/g)].map((match) => match[1]);

    expect(declared).toEqual(PRELOADED_FONTS.map(({ pkg, file }) => `${pkg}/files/${file}`));
  });

  it("never lets the display fonts swap in late", () => {
    const css = readFileSync(path.join(process.cwd(), "src/styles/fonts.css"), "utf-8");
    const displays = [...css.matchAll(/font-family: "([^"]+)";[\s\S]*?font-display: (\w+);/g)].map(
      (match) => [match[1], match[2]],
    );

    expect(displays).toEqual([
      ["Silkscreen", "block"],
      ["VT323", "block"],
      ["Atkinson Hyperlegible", "optional"],
      ["Atkinson Hyperlegible", "optional"],
    ]);
  });
});
