import { expect, test } from "@playwright/test";
import path from "node:path";

const fixtureFile = path.resolve(
  process.cwd(),
  "tests",
  "fixtures",
  "known-c-major.wav",
);

test("importing an audio file runs analysis and shows detected notes", async ({ page }) => {
  test.setTimeout(120000);

  await page.goto("/");

  // Ensure auto-process is on so import → analysis happens automatically
  const autoCheckbox = page.getByRole("checkbox", { name: /auto-process after recording/i });
  await autoCheckbox.check();

  // Use the hidden file input to import the fixture WAV
  const fileInput = page.locator(".import-file-input");
  await fileInput.setInputFiles(fixtureFile);

  // Wait for notes to appear (import → decode → analyze pipeline)
  await expect(page.getByText("Notes Detected")).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip").first()).toBeVisible({ timeout: 60000 });

  // Verify the known C major notes were detected
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".note-chip", { hasText: "E4" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".note-chip", { hasText: "G4" })).toBeVisible({ timeout: 10000 });

  // Original playback should be available since we imported real audio
  await expect(page.getByRole("button", { name: /play original/i })).toBeVisible({ timeout: 10000 });
});

test("import button is visible on landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /import audio file/i })).toBeVisible();
});

test("import button is disabled while recording", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /start recording/i }).click();
  await expect(page.getByText("Listening…")).toBeVisible({ timeout: 15000 });

  await expect(page.getByRole("button", { name: /import audio file/i })).toBeDisabled();

  // Clean up: stop recording
  await page.getByRole("button", { name: /stop recording/i }).click();
});
