import { expect, test, type Page } from "@playwright/test";
import { PALETTE_IDS } from "../../src/lib/palettes";
import { gotoApp } from "./helpers";

/** Contrast ratio between the page backdrop and the framed app background. */
async function backdropContrast(page: Page): Promise<number> {
  return page.evaluate(() => {
    const toRgb = (color: string) => {
      const context = document.createElement("canvas").getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((value) => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const page = luminance(toRgb(getComputedStyle(document.body).backgroundColor));
    const frame = luminance(toRgb(getComputedStyle(document.querySelector(".app-frame")!).backgroundColor));
    return (Math.max(page, frame) + 0.05) / (Math.min(page, frame) + 0.05);
  });
}

test("desktop shows the app in a centred phone frame with the tab bar inside it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoApp(page);

  const frame = await page.locator(".app-frame").boundingBox();
  expect(frame).not.toBeNull();
  expect(frame!.width).toBeLessThan(440);
  expect(Math.abs(frame!.x + frame!.width / 2 - 720)).toBeLessThan(2);

  const tabBar = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
  expect(tabBar!.x).toBeGreaterThanOrEqual(frame!.x);
  expect(tabBar!.x + tabBar!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 0.5);
  expect(tabBar!.y + tabBar!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 0.5);

  // The phone layout is used inside the frame: the tab bar spans the frame, not a floating pill.
  expect(tabBar!.width).toBeGreaterThan(frame!.width - 4);

  // The tab bar stays pinned to the frame while the app scrolls.
  await page.goto("/looper");
  const before = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
  await page.locator("#root").evaluate((root) => root.scrollTo(0, root.scrollHeight));
  const after = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`the desktop backdrop stands apart from the app in every palette in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page);

    for (const palette of PALETTE_IDS) {
      await page.evaluate((id) => localStorage.setItem("riff:palette", id), palette);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-palette", palette);
      expect(await backdropContrast(page), `${palette} ${theme}`).toBeGreaterThanOrEqual(1.15);
    }
  });
}

test("phones keep the full-screen layout with no frame", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  const frame = page.locator(".app-frame");
  await expect(frame).toHaveCSS("border-radius", "0px");
  expect((await frame.boundingBox())!.width).toBe(390);
  const tabBar = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
  expect(Math.round(tabBar!.y + tabBar!.height)).toBe(844);
});

test("phone Builder chord lab scrolls instead of stacking its panels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  await page.getByRole("link", { name: "Builder" }).click();
  await page.getByRole("radio", { name: "A", exact: true }).click();
  await page.getByRole("radio", { name: "Minor", exact: true }).click();
  await page.getByRole("button", { name: /add a minor to builder sequence/i }).click();

  const lastSuggestion = await page.locator(".chord-focus-suggestion").last().boundingBox();
  const notes = await page.locator(".chord-focus__panel--notes").boundingBox();
  expect(notes!.y).toBeGreaterThanOrEqual(lastSuggestion!.y + lastSuggestion!.height);

  // The sequence pane's last control sits above the floating Builder view nav.
  const deleteA = page.getByRole("button", { name: /delete a minor/i });
  await deleteA.scrollIntoViewIfNeeded();
  const deleteButton = await deleteA.boundingBox();
  const viewNav = await page.getByRole("navigation", { name: /builder mobile views/i }).boundingBox();
  expect(deleteButton!.y + deleteButton!.height).toBeLessThanOrEqual(viewNav!.y);
});
