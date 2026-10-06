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
  // Compare against the light-theme tokens so the test follows the palette.
  const expected = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.background = "var(--selected)";
    probe.style.color = "var(--on-selected)";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const result = { background: style.backgroundColor, color: style.color };
    probe.remove();
    return result;
  });
  const activeLane = page.locator(".lane-toggle__button.is-active");
  await expect(activeLane).toHaveCSS("background-color", expected.background);
  await expect(activeLane).toHaveCSS("color", expected.color);
  // Default palette's light-mode ink, not the dark-theme text colour.
  expect(expected.color).toBe("rgb(40, 40, 46)");
});
