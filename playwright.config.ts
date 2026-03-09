import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const fakeAudioFile = path.resolve(
  process.cwd(),
  "tests",
  "fixtures",
  "known-c-major.wav"
);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    permissions: ["microphone"],
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-audio-capture=${fakeAudioFile}`,
          ],
        },
      },
    },
  ],
});
