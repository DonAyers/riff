import { expect, test } from "@playwright/test";
import path from "node:path";

const fixturesDir = path.resolve(process.cwd(), "tests", "fixtures");

/**
 * Helper: import a fixture WAV with a specific instrument profile selected,
 * auto-process on, and return once analysis is complete.
 */
async function importWithProfile(
  page: import("@playwright/test").Page,
  fixtureFile: string,
  profileLabel: string,
) {
  await page.goto("/");

  // Dismiss onboarding if showing
  const backdrop = page.locator(".onboarding-backdrop");
  if (await backdrop.isVisible({ timeout: 1000 }).catch(() => false)) {
    await backdrop.click();
  }

  // Select the instrument profile pill
  await page.getByRole("radio", { name: profileLabel }).click();
  await expect(page.getByRole("radio", { name: profileLabel })).toHaveAttribute("aria-checked", "true");

  // Enable auto-detect
  const autoCheckbox = page.getByText("Auto-detect").locator("..").locator("input[type=checkbox]");
  await autoCheckbox.check();

  // Import the fixture
  const fileInput = page.locator(".import-file-input");
  await fileInput.setInputFiles(fixtureFile);

  // Wait for note chips to appear (pipeline complete)
  await expect(page.locator(".note-chip").first()).toBeVisible({ timeout: 90000 });
}

test.describe("instrument profile e2e", () => {
  test.setTimeout(120000);

  test("guitar profile imports clean guitar C major and detects notes", async ({ page }) => {
    await importWithProfile(
      page,
      path.join(fixturesDir, "guitar-c-major-clean.wav"),
      "Guitar",
    );

    await expect(page.locator(".note-chip")).not.toHaveCount(0);
  });

  test("piano profile imports clean piano C major and detects notes", async ({ page }) => {
    await importWithProfile(
      page,
      path.join(fixturesDir, "piano-c-major-clean.wav"),
      "Piano",
    );

    await expect(page.locator(".note-chip")).not.toHaveCount(0);
  });

  test("guitar profile filters more notes from noisy recording than default", async ({ page }) => {
    // First run with default profile
    await importWithProfile(
      page,
      path.join(fixturesDir, "guitar-c-major-noisy.wav"),
      "Default",
    );
    const defaultCount = await page.locator(".note-chip").count();

    // Then run with guitar profile on same file
    await importWithProfile(
      page,
      path.join(fixturesDir, "guitar-c-major-noisy.wav"),
      "Guitar",
    );
    const guitarCount = await page.locator(".note-chip").count();

    // Guitar profile should produce fewer or equal notes due to filtering
    expect(guitarCount).toBeLessThanOrEqual(defaultCount);
  });

  test("profile selection persists across page reload", async ({ page }) => {
    await page.goto("/");

    // Dismiss onboarding if showing
    const backdrop = page.locator(".onboarding-backdrop");
    if (await backdrop.isVisible({ timeout: 1000 }).catch(() => false)) {
      await backdrop.click();
    }

    // Select Guitar profile
    await page.getByRole("radio", { name: "Guitar" }).click();
    await expect(page.getByRole("radio", { name: "Guitar" })).toHaveAttribute("aria-checked", "true");

    // Reload
    await page.reload();

    // Dismiss onboarding again if it shows
    if (await backdrop.isVisible({ timeout: 1000 }).catch(() => false)) {
      await backdrop.click();
    }

    // Guitar should still be selected
    await expect(page.getByRole("radio", { name: "Guitar" })).toHaveAttribute("aria-checked", "true");
  });
});
