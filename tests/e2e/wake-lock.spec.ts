import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";

test("requests a screen wake lock while the app is active", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __wakeLockRequests?: number }).__wakeLockRequests = 0;

    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          (window as Window & { __wakeLockRequests?: number }).__wakeLockRequests =
            ((window as Window & { __wakeLockRequests?: number }).__wakeLockRequests ?? 0) + 1;

          return {
            released: false,
            type: "screen",
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => true,
            release: async () => undefined,
            onrelease: null,
          };
        },
      },
    });
  });

  await gotoApp(page);

  await expect
    .poll(async () =>
      page.evaluate(() => (window as Window & { __wakeLockRequests?: number }).__wakeLockRequests ?? 0)
    )
    .toBeGreaterThan(0);
});
