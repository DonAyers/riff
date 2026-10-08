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

test("importing a Lospec palette recolours the app, lets roles be remapped and survives a reload", async ({ page }) => {
  await page.route("https://lospec.com/palette-list/*.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        name: "PICO-8",
        author: "Lexaloffle",
        colors: ["000000", "1d2b53", "7e2553", "008751", "ab5236", "5f574f", "c2c3c7", "fff1e8",
          "ff004d", "ffa300", "ffec27", "00e436", "29adff", "83769c", "ff77a8", "ffccaa"],
      }),
    })
  );
  await page.emulateMedia({ colorScheme: "light" });
  await gotoApp(page);
  await page.goto("/settings");

  await page.getByLabel(/lospec link, palette name or hex codes/i).fill("https://lospec.com/palette-list/pico-8");
  await page.getByRole("button", { name: "Import" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-palette", "custom");
  await expect(page.getByRole("radio", { name: /pico-8/i })).toBeChecked();
  expect(await cssToken(page, "--bg")).toBe("rgb(255, 241, 232)");
  expect(await cssToken(page, "--record")).toBe("rgb(255, 0, 77)");

  await page.getByRole("button", { name: /^accent/i }).click();
  await page.getByRole("radiogroup", { name: "Colour for Accent" }).getByRole("radio", { name: "#29adff" }).check();
  expect(await cssToken(page, "--record")).toBe("rgb(41, 173, 255)");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "custom");
  expect(await cssToken(page, "--record")).toBe("rgb(41, 173, 255)");

  // Built-in palettes still work, and the import stays available to switch back to.
  await page.getByRole("radio", { name: /chasm/i }).check();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "chasm");
  await page.getByRole("radio", { name: /pico-8/i }).check();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "custom");
});

test("pasting hex codes makes a palette when Lospec is out of reach", async ({ page }) => {
  await page.route("https://lospec.com/**", (route) => route.abort());
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoApp(page);
  await page.goto("/settings");

  const input = page.getByLabel(/lospec link, palette name or hex codes/i);
  await input.fill("sweetie-16");
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("alert")).toContainText(/paste the palette's hex codes/i);
  await expect(page.locator("html")).not.toHaveAttribute("data-palette", "custom");

  await input.fill("1a1c2c\n5d275d\nb13e53\nef7d57\nffcd75\na7f070\n38b764\n257179\n29366f\n3b5dc9\n41a6f6\n73eff7\nf4f4f4\n94b0c2\n566c86\n333c57");
  await page.getByRole("button", { name: "Import" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-palette", "custom");
  expect(await cssToken(page, "--bg")).toBe("rgb(26, 28, 44)");
});
