import type { Plugin } from "vite";
import { getFontPreloadHrefs } from "./fontPreloads";
import { getThemeBootScript } from "./themeBoot";

const THEME_COLOR_META = /<meta name="theme-color"[^>]*>/;

/**
 * Makes the first paint final: the saved theme and palette are set by a blocking inline
 * script before any CSS paints (no light-to-dark flash), and the first screen's fonts are
 * preloaded so they arrive with the stylesheet (no font swap). See
 * research/spike-initial-load.md.
 */
export function firstPaintPlugin(): Plugin {
  let base = "/";
  return {
    name: "riff-first-paint",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!THEME_COLOR_META.test(html)) throw new Error("index.html needs a theme-color meta");
        const assets = ctx.bundle ? Object.keys(ctx.bundle) : null;
        return {
          // After the theme-color meta, which the script updates.
          html: html.replace(THEME_COLOR_META, (meta) => `${meta}\n    <script>${getThemeBootScript()}</script>`),
          tags: getFontPreloadHrefs(assets, base).map((href) => ({
            tag: "link",
            attrs: { rel: "preload", as: "font", type: "font/woff2", href, crossorigin: "anonymous" },
            injectTo: "head" as const,
          })),
        };
      },
    },
  };
}
