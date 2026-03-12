import { expect, test, type Page } from "@playwright/test";
import { fixturePath, getImportFileInput, gotoApp, switchLane, waitForAnalysisResults } from "./helpers";

async function importFixtureAndAnalyzeAutomatically(page: Page, fileName = "known-c-major.wav"): Promise<void> {
  const analyzeAutomatically = page.getByRole("checkbox", { name: /analyze automatically/i });
  await expect(analyzeAutomatically).toBeVisible();

  if (!(await analyzeAutomatically.isChecked())) {
    await analyzeAutomatically.check();
  }

  await getImportFileInput(page).setInputFiles(fixturePath(fileName));
  await waitForAnalysisResults(page);
}

test("importing an audio file runs analysis and shows detected notes", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page);
  await expect(page.getByText("Record or import audio to see chords")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /analyze automatically/i })).toBeVisible();

  await getImportFileInput(page).setInputFiles(fixturePath("known-c-major.wav"));

  const analyzeNowButton = page.getByRole("button", { name: /analyze now/i });
  await expect(analyzeNowButton).toBeVisible();
  await analyzeNowButton.click();
  await waitForAnalysisResults(page);

  // Verify the known C major notes were detected
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".note-chip", { hasText: "E4" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".note-chip", { hasText: "G4" })).toBeVisible({ timeout: 10000 });

  await expect(page.getByRole("heading", { level: 2, name: "Song Lane" })).toBeVisible();
  await expect(page.getByRole("button", { name: /play recording/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: /play midi preview/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("group", { name: /export options/i })).toBeVisible();
});

test("imported analysis can switch to chord lane and keep playback controls available", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page);
  await importFixtureAndAnalyzeAutomatically(page, "guitar-c-major-clean.wav");
  await expect(page.locator(".note-chip").first()).toBeVisible({ timeout: 60000 });

  await switchLane(page, "Chord");
  await expect(page.getByRole("heading", { level: 2, name: "Chord Lane" })).toBeVisible();

  const voicingLabel = page.getByText(/voicing \d+ of \d+/i);
  await expect(voicingLabel).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".chord-lane-panel .chord-fretboard__diagram")).toBeVisible();
  await expect(page.getByRole("button", { name: /play midi preview/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Notes in this take" })).toBeVisible();

  const nextBtn = page.getByRole("button", { name: /next phrase/i });
  if (await nextBtn.isEnabled()) {
    const before = await voicingLabel.textContent();
    await nextBtn.click();
    await expect(voicingLabel).not.toHaveText(before ?? "");
  }
});

test("clicking a detected chord opens the selected chord sheet", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page);
  await importFixtureAndAnalyzeAutomatically(page, "guitar-c-major-clean.wav");

  const detectedChordButton = page.getByRole("button", {
    name: /^select chord c major$/i,
  });
  await expect(detectedChordButton).toBeVisible({ timeout: 10000 });
  await detectedChordButton.click();

  const dialog = page.getByRole("dialog", { name: "Selected guitar chord" });
  await expect(dialog).toBeVisible();
  const voicingLabel = dialog.getByText(/guitar voicing \d+ of \d+/i);
  await expect(voicingLabel).toBeVisible();
  await expect(dialog.locator(".chord-fretboard__diagram")).toBeVisible();

  const nextPhrase = dialog.getByRole("button", { name: /next phrase/i });
  if (await nextPhrase.isEnabled()) {
    const before = await voicingLabel.textContent();
    await nextPhrase.click();
    await expect(voicingLabel).not.toHaveText(before ?? "");
  }

  await page.getByRole("button", { name: /close selected chord/i }).click();
  await expect(dialog).toHaveCount(0);
});

test("clicking a timeline chord opens the matching selected chord sheet", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page);
  await importFixtureAndAnalyzeAutomatically(page, "guitar-c-major-clean.wav");

  const timelineEventButton = page
    .getByRole("button", { name: /select chord c major at /i })
    .first();
  await expect(timelineEventButton).toBeVisible({ timeout: 10000 });
  await timelineEventButton.click();

  const dialog = page.getByRole("dialog", { name: "Selected guitar chord" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/timeline chord/i)).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2, name: "C Major" })).toBeVisible();
});

test("import button is visible on landing page", async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole("button", { name: /import audio file/i })).toBeVisible();
});

test("import button is disabled while recording", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: /start recording/i }).click();
  await expect(page.getByRole("status")).toHaveText(/recording live/i, { timeout: 15000 });

  await expect(page.getByRole("button", { name: /import audio file/i })).toBeDisabled();

  // Clean up: stop recording
  await page.getByRole("button", { name: /stop recording/i }).click();
});
