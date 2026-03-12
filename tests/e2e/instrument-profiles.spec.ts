import { expect, test } from "@playwright/test";
import { gotoApp, importFixture, selectDetectionFocus, setSettingToggle, waitForAnalysisResults } from "./helpers";

/**
 * Helper: import a fixture WAV with a specific instrument profile selected,
 * auto-process on, and return once analysis is complete.
 */
async function importWithProfile(
  page: import("@playwright/test").Page,
  fixtureFileName: string,
  profileLabel: "Full range" | "Guitar",
) {
  await gotoApp(page);

  await selectDetectionFocus(page, profileLabel);
  await setSettingToggle(page, "Auto-detect", true);
  await importFixture(page, fixtureFileName);
  await waitForAnalysisResults(page);
}

test.describe("instrument profile e2e", () => {
  test.setTimeout(120000);

  test("detection focus stays guitar-first", async ({ page }) => {
    await gotoApp(page);

    const profileOptions = page.locator(".profile-picker").getByRole("radio");

    await expect(page.getByRole("radiogroup", { name: "Detection focus" })).toBeVisible();
    await expect(profileOptions.nth(0)).toHaveValue("guitar");
    await expect(profileOptions.nth(1)).toHaveValue("default");
    await expect(page.getByRole("radio", { name: "Guitar" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Full range" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Piano" })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Guitar" })).toBeChecked();
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
        "Full range",
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

  test("profile selection persists across page reload", async ({ page }) => {
    await gotoApp(page);

    await selectDetectionFocus(page, "Full range");

    await page.reload();

    await expect(page.getByRole("radio", { name: "Full range" })).toBeChecked();
  });
});
