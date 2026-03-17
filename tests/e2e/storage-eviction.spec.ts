import { expect, test } from "@playwright/test";
import { gotoApp, importAndAnalyzeFixture } from "./helpers";

test("shows an export reminder on browsers more likely to clear saved riffs", async ({ page }) => {
  test.setTimeout(180000);

  await page.addInitScript(() => {
    const navigatorPrototype = Object.getPrototypeOf(window.navigator);

    Object.defineProperty(navigatorPrototype, "vendor", {
      configurable: true,
      get: () => "Apple Computer, Inc.",
    });
    Object.defineProperty(navigatorPrototype, "platform", {
      configurable: true,
      get: () => "iPhone",
    });
    Object.defineProperty(navigatorPrototype, "userAgent", {
      configurable: true,
      get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    Object.defineProperty(navigatorPrototype, "maxTouchPoints", {
      configurable: true,
      get: () => 5,
    });

    const storage = window.navigator.storage;
    if (storage) {
      Object.defineProperty(storage, "persisted", {
        configurable: true,
        value: async () => false,
      });
      return;
    }

    Object.defineProperty(window.navigator, "storage", {
      configurable: true,
      value: {
        persisted: async () => false,
      },
    });
  });

  await gotoApp(page);
  await importAndAnalyzeFixture(page);

  await expect(page.getByRole("note", { name: "Export reminder" })).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByText(/saved riffs can clear out on this browser/i),
  ).toBeVisible();
});
