import { expect, test } from "@playwright/test";
import path from "node:path";

const fixtureFile = path.resolve(
  process.cwd(),
  "tests",
  "fixtures",
  "known-c-major.wav",
);

test("export buttons appear after importing and analysing audio", async ({ page }) => {
  test.setTimeout(120000);

  await page.goto("/");

  // Enable auto-process so import triggers analysis
  const autoCheckbox = page.getByRole("checkbox", { name: /auto-process after recording/i });
  await autoCheckbox.check();

  // Import the fixture file
  const fileInput = page.locator(".import-file-input");
  await fileInput.setInputFiles(fixtureFile);

  // Wait for analysis to complete
  await expect(page.getByText("Notes Detected")).toBeVisible({ timeout: 60000 });

  // Export panel should be visible with MIDI and WAV buttons
  const exportGroup = page.getByRole("group", { name: /export options/i });
  await expect(exportGroup).toBeVisible({ timeout: 10000 });

  await expect(page.getByRole("button", { name: /export as midi/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /export as midi/i })).toBeEnabled();

  await expect(page.getByRole("button", { name: /export as wav/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /export as wav/i })).toBeEnabled();
});

test("MIDI export triggers a download", async ({ page }) => {
  test.setTimeout(120000);

  await page.goto("/");

  const autoCheckbox = page.getByRole("checkbox", { name: /auto-process after recording/i });
  await autoCheckbox.check();

  const fileInput = page.locator(".import-file-input");
  await fileInput.setInputFiles(fixtureFile);

  await expect(page.getByText("Notes Detected")).toBeVisible({ timeout: 60000 });

  // Wait for the MIDI export button and trigger download
  const midiBtn = page.getByRole("button", { name: /export as midi/i });
  await expect(midiBtn).toBeEnabled({ timeout: 10000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    midiBtn.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.mid$/);
});

test("WAV export triggers a download", async ({ page }) => {
  test.setTimeout(120000);

  await page.goto("/");

  const autoCheckbox = page.getByRole("checkbox", { name: /auto-process after recording/i });
  await autoCheckbox.check();

  const fileInput = page.locator(".import-file-input");
  await fileInput.setInputFiles(fixtureFile);

  await expect(page.getByText("Notes Detected")).toBeVisible({ timeout: 60000 });

  const wavBtn = page.getByRole("button", { name: /export as wav/i });
  await expect(wavBtn).toBeEnabled({ timeout: 10000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    wavBtn.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.wav$/);
});
