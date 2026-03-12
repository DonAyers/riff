import { expect, test } from "@playwright/test";
import { gotoApp, importAndAnalyzeFixture, switchLane } from "./helpers";

test("importing an audio file runs analysis and shows detected notes", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page);
  await importAndAnalyzeFixture(page);

  // Verify the known C major notes were detected
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".note-chip", { hasText: "E4" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".note-chip", { hasText: "G4" })).toBeVisible({ timeout: 10000 });

  await expect(page.getByRole("heading", { level: 2, name: "Song Lane" })).toBeVisible();
  await expect(page.getByRole("button", { name: /play recording/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: /play midi preview/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("group", { name: /export options/i })).toBeVisible();
});

test("imported analysis can switch to chord lane and show guitar voicings", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page);
  await importAndAnalyzeFixture(page);
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible({ timeout: 60000 });

  await switchLane(page, "Chord");
  await expect(page.getByRole("heading", { level: 2, name: "Chord Lane" })).toBeVisible();

  // Check for any voicing (flexible - C Major might have different counts)
  const voicingLabel = page.getByText(/voicing \d+ of \d+/i);
  await expect(voicingLabel).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("img", { name: /^fretboard for /i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Notes in this take" })).toBeVisible();

  // Test next phrase cycling
  const nextBtn = page.getByRole("button", { name: /next phrase/i });
  if (await nextBtn.isEnabled()) {
    const before = await voicingLabel.textContent();
    await nextBtn.click();
    await expect(voicingLabel).not.toHaveText(before ?? "");
  }
});

test("import button is visible on landing page", async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole("button", { name: /import audio file/i })).toBeVisible();
});

test("import button is disabled while recording", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: /start recording/i }).click();
  await expect(page.getByText("Recording…")).toBeVisible({ timeout: 15000 });

  await expect(page.getByRole("button", { name: /import audio file/i })).toBeDisabled();

  // Clean up: stop recording
  await page.getByRole("button", { name: /stop recording/i }).click();
});
