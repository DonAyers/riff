import { expect, test, type Page } from "@playwright/test";
import { gotoApp, importAndAnalyzeFixture, importFixture } from "./helpers";

// Common phone viewports (CSS px), plus a short window (browser chrome showing) and
// landscape. Every control must stay reachable at all of them: either on screen, or
// reachable by scrolling, and never clipped or covered by the tab bar.
const PHONE_SIZES = [
  { width: 320, height: 568 }, // iPhone SE (1st gen)
  { width: 360, height: 640 }, // small Android
  { width: 375, height: 667 }, // iPhone SE (2nd/3rd gen)
  { width: 390, height: 844 }, // iPhone 12–14
  { width: 412, height: 915 }, // Pixel / Galaxy
  { width: 430, height: 932 }, // iPhone Pro Max
  { width: 360, height: 560 }, // short: Android with browser bars showing
  { width: 844, height: 390 }, // landscape
] as const;

const CONTROLS = "button:visible, a:visible, input:visible, select:visible";

/**
 * Checks every enabled control at every phone size. `click({ trial: true })` runs
 * Playwright's actionability checks without clicking: it scrolls the control into view
 * and fails if something else (a clipping ancestor, the tab bar) would get the tap.
 */
async function expectControlsReachable(page: Page, screen: string) {
  const problems: string[] = [];

  for (const size of PHONE_SIZES) {
    await page.setViewportSize(size);
    const label = `${screen} @ ${size.width}x${size.height}`;

    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflowX > 0) problems.push(`${label}: page scrolls sideways by ${overflowX}px`);

    const controls = page.locator(CONTROLS);
    const count = await controls.count();
    expect(count, `${label} has controls`).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      if (await control.isDisabled()) continue;

      try {
        await control.click({ trial: true, timeout: 1000 });
      } catch {
        const name = await control.evaluate(
          (element) => element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName
        );
        problems.push(`${label}: "${name}" can't be reached`);
      }
    }
  }

  expect(problems).toEqual([]);
  // Leave a normal phone size for the next step.
  await page.setViewportSize({ width: 390, height: 844 });
}

test("record, take check and tool screens keep every control reachable on phones", async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page, { autoProcess: false });

  await expect(page.getByTestId("stage-record")).toBeVisible();
  await expectControlsReachable(page, "Record");

  await importFixture(page);
  await expect(page.getByTestId("stage-approve")).toBeVisible({ timeout: 15000 });
  await expectControlsReachable(page, "Take check");

  await page.getByRole("button", { name: "Retake" }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete this take" })).toBeVisible();
  await expectControlsReachable(page, "Take check with delete prompt");

  const primaryNav = page.getByRole("navigation", { name: /primary/i });
  for (const [tab, heading] of [
    ["Builder", null],
    ["Tuner", "Guitar tuner"],
    ["Looper", "Looper"],
  ] as const) {
    await primaryNav.getByRole("link", { name: tab }).click();
    if (heading) {
      await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/builder$/);
    }
    // Each tab loads on first use; wait for it to replace the placeholder.
    await expect(page.locator(".screen-fallback")).toHaveCount(0);
    await expectControlsReachable(page, tab);
  }

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Settings" })).toBeVisible();
  await expectControlsReachable(page, "Settings");
});

test("analysis screens keep every control reachable on phones", async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page, { autoProcess: false, instrumentProfile: "default" });
  await importAndAnalyzeFixture(page);

  const stage = page.getByTestId("stage-analyze");

  await expectControlsReachable(page, "Melody · Chords");
  for (const screen of ["Notes", "Export"]) {
    await stage.getByRole("button", { name: screen, exact: true }).click();
    await expectControlsReachable(page, `Melody · ${screen}`);
  }

  await page.getByRole("tab", { name: "Guitar" }).click();
  await expectControlsReachable(page, "Guitar · Chord");
  for (const screen of ["Shape", "Export"]) {
    await stage.getByRole("button", { name: screen, exact: true }).click();
    await expectControlsReachable(page, `Guitar · ${screen}`);
  }
});

test("New recording leaves the chord results for a fresh take without a reload", async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 375, height: 667 });
  await gotoApp(page, { autoProcess: false, instrumentProfile: "default" });
  await importAndAnalyzeFixture(page);

  const newRecording = page.getByRole("button", { name: "New recording" });
  await expect(newRecording).toBeInViewport();
  await newRecording.click();

  await expect(page.getByTestId("stage-record")).toBeVisible();
  await expect(page.getByTestId("stage-analyze")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start recording" })).toBeVisible();

  // The analysed take stays in the library and can be reopened.
  await expect(page.locator(".session-picker-trigger")).toBeVisible();

  // The next take goes through the normal flow again.
  await importFixture(page);
  await expect(page.getByTestId("stage-approve")).toBeVisible({ timeout: 15000 });
});
