import { expect, test } from "@playwright/test";
import { fixturePath, getImportFileInput, gotoApp, waitForAnalysisResults } from "./helpers";

test("keyboard shortcuts are listed in the help sheet", async ({ page }) => {
  await page.goto("/");

  const onboarding = page.getByRole("dialog", { name: /help and about riff/i });
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByText(/keyboard shortcuts/i)).toBeVisible();
  await expect(onboarding.getByText(/^R$/)).toBeVisible();
  await expect(onboarding.getByText(/jump to the export buttons/i)).toBeVisible();
});

test("analyze, playback, and export shortcuts work after importing audio", async ({ page }) => {
  test.setTimeout(180000);

  await gotoApp(page, { autoProcess: false, onboardingSeen: true });

  await getImportFileInput(page).setInputFiles(fixturePath("known-c-major.wav"));
  await expect(page.getByRole("button", { name: /analyze now/i })).toBeEnabled({ timeout: 15000 });

  await page.keyboard.press("a");
  await waitForAnalysisResults(page);

  const playMidiPreviewButton = page.locator(".piano-roll").getByRole("button", {
    name: /play midi preview/i,
  });
  await expect(playMidiPreviewButton).toBeVisible({ timeout: 10000 });

  await page.keyboard.press("p");
  await expect(
    page.locator(".piano-roll").getByRole("button", { name: /stop midi preview/i })
  ).toBeVisible({ timeout: 10000 });

  await page.keyboard.press("p");
  await expect(playMidiPreviewButton).toBeVisible({ timeout: 10000 });

  await page.keyboard.press("e");
  await expect(page.getByRole("button", { name: "Export as MIDI" })).toBeFocused();
});

test("record shortcut toggles recording from the landing view", async ({ page }) => {
  await gotoApp(page, { onboardingSeen: true });
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();
  await page.waitForTimeout(100);

  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: /stop recording/i })).toHaveClass(/recording/);
  await expect(page.getByRole("status")).toHaveText("Recording live");

  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();
});
