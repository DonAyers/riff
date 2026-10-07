import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { getFontPreloadHrefs } from "./src/lib/fontPreloads";
import { getThemeBootScript } from "./src/lib/themeBoot";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string };

const resolveBuildId = () => {
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;

  if (gitSha) {
    return gitSha.slice(0, 7);
  }

  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "local";
  }
};

const THEME_COLOR_META = /<meta name="theme-color"[^>]*>/;

/**
 * Makes the first paint final: the saved theme and palette are set by a blocking inline
 * script before any CSS paints (no light-to-dark flash), and the first screen's fonts are
 * preloaded so they arrive with the stylesheet (no font swap). See
 * research/spike-initial-load.md.
 */
function firstPaintPlugin(): Plugin {
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

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_BUILD_ID__: JSON.stringify(resolveBuildId()),
  },
  plugins: [
    react(),
    firstPaintPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,bin,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /assets\/.*\.(?:bin|json)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "riff-model-assets",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
  worker: {
    format: "es",
  },
});
