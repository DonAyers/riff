import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_BUILD_ID__: JSON.stringify(resolveBuildId()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,bin,png,svg}"],
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
