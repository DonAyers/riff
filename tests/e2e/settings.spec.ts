import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";

async function cssToken(page: import("@playwright/test").Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.background = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, token);
}

test("defaults to Vanilla Milkshake", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await gotoApp(page);

  await expect(page.locator("html")).toHaveAttribute("data-palette", "vanilla-milkshake");
  expect(await cssToken(page, "--bg")).toBe("rgb(255, 247, 228)");
});

test("picking a palette in Settings recolours the app and survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoApp(page);

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 2, name: "Settings" })).toBeVisible();

  await page.getByRole("radio", { name: /chasm/i }).check();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "chasm");
  await expect(page.getByRole("radio", { name: /chasm/i })).toBeChecked();
  expect(await cssToken(page, "--bg")).toBe("rgb(50, 49, 59)");
  await expect(page.locator("meta[name='theme-color']")).toHaveAttribute("content", "#32313b");

  await page.getByRole("radio", { name: "Light" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "chasm");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("link", { name: "Tuner" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "chasm");
});
