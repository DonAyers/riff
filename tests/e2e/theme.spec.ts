import { expect, test } from "@playwright/test";
import { gotoApp, importAndAnalyzeFixture } from "./helpers";

const THEME_STORAGE_KEY = "riff:theme-preference";

async function expectTheme(page: import("@playwright/test").Page, theme: "dark" | "light") {
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
}

test("theme follows OS preference changes when no override is saved", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoApp(page);

  await expectTheme(page, "dark");

  await page.emulateMedia({ colorScheme: "light" });

  await expectTheme(page, "light");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY))
    .toBeNull();
});

test("theme toggle persists light mode and keeps Builder readable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoApp(page);

  await page.getByRole("button", { name: /switch to light mode/i }).click();

  await expectTheme(page, "light");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY))
    .toBe("light");
  await expect(page.getByRole("button", { name: /switch to dark mode/i })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.reload();
  await expectTheme(page, "light");

  await page.getByRole("link", { name: "Builder" }).click();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByRole("heading", { level: 2, name: /build the sequence/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /switch to dark mode/i })).toBeVisible();
});

test("light mode keeps analysis controls readable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoApp(page);

  await page.getByRole("button", { name: /switch to light mode/i }).click();
  await importAndAnalyzeFixture(page);

  await expectTheme(page, "light");
  await expect(page.locator(".lane-toggle__button.is-active")).toHaveCSS(
    "background-color",
    "rgb(95, 113, 0)"
  );
  await expect(page.locator(".lane-toggle__button.is-active")).toHaveCSS(
    "color",
    "rgb(255, 251, 234)"
  );
});
