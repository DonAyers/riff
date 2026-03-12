import { expect, test } from "@playwright/test";
import { gotoApp, importFixture, selectInstrumentProfile, setSettingToggle, waitForAnalysisResults } from "./helpers";

/**
 * Helper: import a fixture WAV with a specific instrument profile selected,
 * auto-process on, and return once analysis is complete.
 */
async function importWithProfile(
  page: import("@playwright/test").Page,
  fixtureFileName: string,
  profileLabel: "Default" | "Guitar" | "Piano",
) {
  await gotoApp(page);

  await selectInstrumentProfile(page, profileLabel);
  await setSettingToggle(page, "Auto-detect", true);
  await importFixture(page, fixtureFileName);
  await waitForAnalysisResults(page);
}

test.describe("instrument profile e2e", () => {
  test.setTimeout(120000);

  test("primary profile picker stays guitar-first", async ({ page }) => {
    await gotoApp(page);

    await expect(page.getByRole("radio", { name: "Default" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Guitar" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Piano" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Guitar" })).toHaveAttribute("aria-checked", "true");
  });

  test("guitar profile imports clean guitar C major and detects notes", async ({ page }) => {
    await importWithProfile(
      page,
      "guitar-c-major-clean.wav",
      "Guitar",
    );

    await expect(page.locator(".note-chip")).not.toHaveCount(0);
  });

  test("guitar profile filters more notes from noisy recording than default", async ({ page }) => {
    // First run with default profile
    await importWithProfile(
      page,
      "guitar-c-major-noisy.wav",
      "Default",
    );
    const defaultCount = await page.locator(".note-chip").count();

    // Then run with guitar profile on same file
    await importWithProfile(
      page,
      "guitar-c-major-noisy.wav",
      "Guitar",
    );
    const guitarCount = await page.locator(".note-chip").count();

    // Guitar profile should produce fewer or equal notes due to filtering
    expect(guitarCount).toBeLessThanOrEqual(defaultCount);
  });

  test("non-default profile selection persists across page reload", async ({ page }) => {
    await gotoApp(page);

    // Select a non-default profile so the reload check proves persistence.
    await selectInstrumentProfile(page, "Piano");

    // Reload
    await page.reload();

    // Piano should still be selected
    await expect(page.getByRole("radio", { name: "Piano" })).toHaveAttribute("aria-checked", "true");
  });
});
