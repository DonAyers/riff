import { defineConfig } from "vitest/config";

// Slow end-to-end benchmarks (real Basic Pitch inference). Run with `npm run benchmark:chords`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["benchmarks/**/*.benchmark.ts"],
    testTimeout: 30 * 60 * 1000,
  },
});
