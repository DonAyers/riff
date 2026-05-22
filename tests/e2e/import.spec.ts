import { expect, test, type Page } from "@playwright/test";
import { fixturePath, getImportFileInput, gotoApp, switchLane, waitForAnalysisResults } from "./helpers";

async function importFixtureAndAnalyzeAutomatically(page: Page, fileName = "known-c-major.wav"): Promise<void> {
  await getImportFileInput(page).setInputFiles(fixturePath(fileName));
  await expect(page.getByRole("heading", { level: 2, name: /take check/i })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /^analyze$/i }).click();
  await waitForAnalysisResults(page);
}

test("importing an audio file runs analysis and shows detected notes", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page);
  await expect(page.getByText("Record live or import audio")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /analyze automatically/i })).toHaveCount(0);

  await getImportFileInput(page).setInputFiles(fixturePath("known-c-major.wav"));

  await expect(page.getByRole("heading", { level: 2, name: /take check/i })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /^analyze$/i }).click();
  await expect(page.locator(".progress-bar-title", { hasText: /listening for notes/i }).first()).toBeVisible({
    timeout: 15000
  });
  await waitForAnalysisResults(page);

  // Verify the known C major notes were detected
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".note-chip", { hasText: "E4" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".note-chip", { hasText: "G4" })).toBeVisible({ timeout: 10000 });

  await expect(page.getByRole("heading", { level: 2, name: "Analyze notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: /play recording/i })).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(
    page.locator(".piano-roll").getByRole("button", { name: /play midi preview/i })
  ).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("group", { name: /export options/i })).toBeVisible();
  await expect(page.locator(".session-picker-trigger__meta")).toContainText("PCM");
});

test("imported analysis can switch to chord lane and keep playback controls available", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page);
  await importFixtureAndAnalyzeAutomatically(page, "guitar-c-major-clean.wav");
  await expect(page.locator(".note-chip").first()).toBeVisible({ timeout: 60000 });

  await switchLane(page, "Guitar");
  await expect(page.getByRole("heading", { level: 2, name: "Analyze chords" })).toBeVisible();
  await page.getByRole("button", { name: "Shape" }).click();

  const voicingLabel = page.getByText(/shape \d+ of \d+/i);
  await expect(voicingLabel).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".chord-lane-panel .chord-fretboard__diagram")).toBeVisible();

  const nextBtn = page.getByRole("button", { name: /next shape/i });
  if (await nextBtn.isEnabled()) {
    const before = await voicingLabel.textContent();
    await nextBtn.click();
    await expect(voicingLabel).not.toHaveText(before ?? "");
  }

  await page.getByRole("button", { name: "Chord" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Notes in this take" })).toBeVisible();
});

test("piano roll playback controls toggle cleanly between play and stop", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page);
  await importFixtureAndAnalyzeAutomatically(page, "known-c-major.wav");

  const pianoRoll = page.locator(".piano-roll");
  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(pianoRoll.getByRole("heading", { level: 2, name: "Performance timeline" })).toBeVisible();

  const playButton = pianoRoll.getByRole("button", { name: /play midi preview/i });
  await expect(playButton).toBeVisible();
  await playButton.click();

  const stopButton = pianoRoll.getByRole("button", { name: /stop midi preview/i });
  await expect(stopButton).toBeVisible();
  await stopButton.click();

  await expect(pianoRoll.getByRole("button", { name: /play midi preview/i })).toBeVisible();
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
  await page.getByRole("button", { name: "Timeline" }).click();

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
