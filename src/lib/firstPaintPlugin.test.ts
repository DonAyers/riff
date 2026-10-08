import { readFileSync } from "node:fs";
import path from "node:path";
import type { HtmlTagDescriptor, IndexHtmlTransformContext, IndexHtmlTransformHook, ResolvedConfig } from "vite";
import { describe, expect, it } from "vitest";
import { firstPaintPlugin } from "./firstPaintPlugin";

const indexHtml = readFileSync(path.join(process.cwd(), "index.html"), "utf-8");

const builtFonts = [
  "assets/silkscreen-latin-400-normal-CtPo2yA5.woff2",
  "assets/vt323-latin-400-normal-wDgJuOC9.woff2",
  "assets/atkinson-hyperlegible-latin-400-normal-BrHNak5F.woff2",
  "assets/atkinson-hyperlegible-latin-700-normal-GZI4o3u0.woff2",
];

function transform(html: string, ctx: Partial<IndexHtmlTransformContext>, base = "/") {
  const plugin = firstPaintPlugin();
  (plugin.configResolved as (config: ResolvedConfig) => void)({ base } as ResolvedConfig);
  const hook = plugin.transformIndexHtml as { handler: IndexHtmlTransformHook };
  return hook.handler.call({} as never, html, ctx as IndexHtmlTransformContext) as {
    html: string;
    tags: HtmlTagDescriptor[];
  };
}

describe("first paint plugin", () => {
  it("inlines the theme boot script right after the theme-color meta in a build", () => {
    const bundle = Object.fromEntries(["assets/index-abc.js", ...builtFonts].map((name) => [name, {}]));
    const { html } = transform(indexHtml, { bundle: bundle as never });

    expect(html).toMatch(/<meta name="theme-color"[^>]*>\s*<script>\(function bootTheme\(/);
    // A classic (blocking) script, not a module, so it runs before first paint.
    expect(html).not.toMatch(/<script type="module">\(function bootTheme/);
  });

  it("preloads the hashed font files in a build, under the configured base", () => {
    const bundle = Object.fromEntries(builtFonts.map((name) => [name, {}]));
    const { tags } = transform(indexHtml, { bundle: bundle as never }, "/riff/");

    expect(tags.map((tag) => tag.attrs)).toEqual(
      builtFonts.map((name) => ({
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: `/riff/${name}`,
        crossorigin: "anonymous",
      })),
    );
    expect(tags.every((tag) => tag.injectTo === "head")).toBe(true);
  });

  it("fails loudly if index.html loses its theme-color meta", () => {
    expect(() => transform("<html><head></head></html>", {})).toThrow(/theme-color/);
  });
});
