import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";

test("the saved theme and palette apply before the app script runs", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("riff:palette", "chasm"));
  // Without the app bundle, only what index.html does on its own can theme the page.
  await page.route("**/src/main.tsx*", (route) => route.abort());
  await page.route("**/assets/index-*.js", (route) => route.abort());
  await page.goto("/");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(html).toHaveAttribute("data-palette", "chasm");
  await expect(page.locator("meta[name='theme-color']")).toHaveAttribute("content", "#32313b");
});

test("the brand fonts are preloaded once and never swap in late", async ({ page }) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".woff2")) fontRequests.push(new URL(request.url()).pathname);
  });
  await gotoApp(page);
  await expect(page.getByRole("heading", { level: 2, name: /record/i })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const preloads = await page
    .locator("link[rel='preload'][as='font']")
    .evaluateAll((links) => links.map((link) => [link.getAttribute("href"), link.getAttribute("crossorigin")]));
  for (const font of [
    "silkscreen-latin-400",
    "vt323-latin-400",
    "atkinson-hyperlegible-latin-400",
    "atkinson-hyperlegible-latin-700",
  ]) {
    const match = preloads.find(([href]) => href?.includes(font));
    expect(match, font).toBeDefined();
    expect(match![1], `${font} crossorigin`).toBe("anonymous");
    // One request means the stylesheet reused the preload; a mismatch fetches it twice.
    expect(fontRequests.filter((url) => url.includes(font)), font).toHaveLength(1);
  }

  // Display fonts block rather than swap, so the title and timer never draw in Courier first.
  const faces = await page.evaluate(() =>
    Array.from(document.fonts, (face) => [face.family.replace(/"/g, ""), face.display, face.status]),
  );
  expect(faces).toEqual(
    expect.arrayContaining([
      ["Silkscreen", "block", "loaded"],
      ["VT323", "block", "loaded"],
    ]),
  );
});

test("the record screen loads without the other tabs' code", async ({ page }) => {
  const modules: string[] = [];
  page.on("request", (request) => modules.push(new URL(request.url()).pathname));
  await gotoApp(page);
  await expect(page.getByRole("heading", { level: 2, name: /record/i })).toBeVisible();
  // Give any eager dynamic imports time to fire.
  await page.waitForTimeout(1500);

  const deferred = [
    "/src/components/Looper.tsx",
    "/src/components/GuitarTuner.tsx",
    "/src/components/SongBuilder.tsx",
    "/src/components/SettingsPanel.tsx",
    "/src/components/ChordMapExplorer.tsx",
    "/src/components/ChordFretboard.tsx",
    "deps/svguitar.js",
    "deps/smplr.js",
    "deps/pitchy.js",
  ];
  for (const module of deferred) {
    expect(modules.filter((path) => path.endsWith(module)), module).toEqual([]);
  }

  // Opening a tab loads its code on demand.
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Looper" }).click();
  await expect(page.getByRole("region", { name: "Looper" })).toBeVisible();
  expect(modules.some((path) => path.endsWith("/src/components/Looper.tsx"))).toBe(true);
});
