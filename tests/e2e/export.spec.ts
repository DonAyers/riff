import { expect, test } from "@playwright/test";
import { gotoApp, importAndAnalyzeFixture } from "./helpers";

test("export buttons appear after importing and analysing audio", async ({ page }) => {
  test.setTimeout(180000);

  await gotoApp(page);
  await importAndAnalyzeFixture(page);

  // Export panel should be visible with the current song-lane export options.
  const exportGroup = page.getByRole("group", { name: /export options/i });
  await expect(exportGroup).toBeVisible({ timeout: 10000 });

  await expect(page.getByRole("button", { name: "Export as MIDI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export as MIDI" })).toBeEnabled();

  await expect(page.getByRole("button", { name: "Export as WAV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export as WAV" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Export as MP3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export as MP3" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /export original audio/i })).toHaveCount(0);
});

test("MIDI export triggers a download", async ({ page }) => {
  test.setTimeout(180000);

  await gotoApp(page);
  await importAndAnalyzeFixture(page);

  // Wait for the MIDI export button and trigger download
  const midiBtn = page.getByRole("button", { name: "Export as MIDI" });
  await expect(midiBtn).toBeEnabled({ timeout: 10000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    midiBtn.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.mid$/);
});

test("WAV export triggers a download", async ({ page }) => {
  test.setTimeout(180000);

  await gotoApp(page);
  await importAndAnalyzeFixture(page);

  const wavBtn = page.getByRole("button", { name: "Export as WAV" });
  await expect(wavBtn).toBeEnabled({ timeout: 10000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    wavBtn.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.wav$/);
});
