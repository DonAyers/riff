import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
