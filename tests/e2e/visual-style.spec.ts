import { expect, test, type Page } from "@playwright/test";
import { PALETTE_IDS } from "../../src/lib/palettes";
import { gotoApp } from "./helpers";

const ROUTES = ["/", "/builder", "/tuner", "/looper", "/settings"] as const;

/** Lists every visible element that still draws a shadow, glow or gradient. */
async function findDecorations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (element.closest("[hidden]") || element.getClientRects().length === 0) continue;
      const style = getComputedStyle(element);
      const label = `${element.tagName.toLowerCase()}.${String(element.className)}`;
      if (style.boxShadow !== "none") offenders.push(`${label} box-shadow`);
      if (style.textShadow !== "none") offenders.push(`${label} text-shadow`);
      if (/radial-gradient|conic-gradient/.test(style.backgroundImage)) {
        offenders.push(`${label} gradient`);
      }
      if (style.backdropFilter && style.backdropFilter !== "none") {
        offenders.push(`${label} backdrop-filter`);
      }
    }
    return offenders;
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`every tab is flat in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);

    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.locator("header.app-header:visible")).toHaveCount(1);
      expect(await findDecorations(page), `decorations on ${route}`).toEqual([]);
    }
  });
}

test("self-hosted pixel fonts load for headings and readouts", async ({ page }) => {
  await gotoApp(page);
  await page.goto("/tuner");
  await page.evaluate(() => document.fonts.ready);

  // document.fonts.check() returns true for families with no @font-face at all,
  // so assert on the registered FontFace objects instead.
  const loaded = await page.evaluate(async () => {
    const families = ["Silkscreen", "VT323", "Atkinson Hyperlegible"];
    await Promise.all(families.map((family) => document.fonts.load(`16px "${family}"`)));
    const faces = Array.from(document.fonts);
    return Object.fromEntries(
      families.map((family) => [
        family,
        faces.some((face) => face.family.replace(/["']/g, "") === family && face.status === "loaded"),
      ])
    );
  });
  expect(loaded).toEqual({ Silkscreen: true, VT323: true, "Atkinson Hyperlegible": true });

  await expect(page.locator(".app-title-link")).toHaveCSS("font-family", /Silkscreen/);
  await expect(page.locator("body")).toHaveCSS("font-family", /Atkinson Hyperlegible/);
});

test("the header looks the same on every tab", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  const boxes = [];
  for (const route of ROUTES) {
    await page.goto(route);
    const title = page.locator("header.app-header:visible .app-title-link");
    await expect(title).toBeVisible();
    boxes.push(await title.boundingBox());
  }

  const [first, ...rest] = boxes;
  for (const box of rest) {
    expect(Math.round(box!.x)).toBe(Math.round(first!.x));
    expect(Math.round(box!.height)).toBe(Math.round(first!.height));
  }
});

for (const theme of ["light", "dark"] as const) {
  for (const palette of PALETTE_IDS) {
    test(`primary button labels meet WCAG AA contrast in ${palette} ${theme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((id) => localStorage.setItem("riff:palette", id), palette);
      await gotoApp(page);
      await page.goto("/tuner");
      await expect(page.locator("html")).toHaveAttribute("data-palette", palette);

      const start = page.getByRole("button", { name: "Start tuner" });
      await expect(start).toBeVisible();

      const ratio = await start.evaluate((element) => {
        // Resolve any CSS colour (including color-mix output) to sRGB via a canvas.
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
        const style = getComputedStyle(element);
        const text = luminance(toRgb(style.color));
        const fill = luminance(toRgb(style.backgroundColor));
        return (Math.max(text, fill) + 0.05) / (Math.min(text, fill) + 0.05);
      });

      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`browser theme colour matches the page background for every palette in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await gotoApp(page);

    for (const palette of PALETTE_IDS) {
      await page.evaluate((id) => localStorage.setItem("riff:palette", id), palette);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-palette", palette);

      const { background, meta } = await page.evaluate(() => {
        // Resolve the app background (including color-mix output) to hex via a canvas.
        // On desktop the body is the backdrop, so read the phone frame instead.
        const context = document.createElement("canvas").getContext("2d")!;
        context.fillStyle = getComputedStyle(document.querySelector(".app-frame")!).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
        return {
          background: hex,
          meta: document.querySelector("meta[name='theme-color']")?.getAttribute("content"),
        };
      });
      expect(meta, `${palette} ${theme}`).toBe(background);
    }
  });
}
