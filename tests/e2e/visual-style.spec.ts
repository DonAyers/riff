import { expect, test, type Page } from "@playwright/test";
import { gotoApp } from "./helpers";

const ROUTES = ["/", "/builder", "/tuner", "/looper"] as const;

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
