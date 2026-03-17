import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import { gotoApp, importAndAnalyzeFixture, switchLane } from "./helpers";

async function downloadToBuffer(download: { path(): Promise<string | null> }): Promise<Buffer> {
  const filePath = await download.path();
  if (!filePath) {
    throw new Error("Download path was unavailable");
  }

  return fs.readFile(filePath);
}

function readUint16LE(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset);
}

function readUint32LE(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

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
  const wavBytes = await downloadToBuffer(download);
  expect(readUint32LE(wavBytes, 24)).toBe(22050);
  expect(readUint16LE(wavBytes, 34)).toBe(16);
});

test("WAV quality options stay opt-in and apply to the exported file", async ({ page }) => {
  test.setTimeout(180000);

  await gotoApp(page);
  await importAndAnalyzeFixture(page);

  const wavQualityBtn = page.getByRole("button", { name: "Show WAV quality options" });
  await expect(wavQualityBtn).toBeEnabled({ timeout: 10000 });
  await expect(wavQualityBtn).toHaveAttribute("aria-expanded", "false");

  await wavQualityBtn.click();
  await expect(page.getByRole("button", { name: "Hide WAV quality options" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("checkbox", { name: "24-bit depth" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Normalize peak" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "44.1 kHz compatibility" })).not.toBeChecked();

  await page.getByRole("checkbox", { name: "24-bit depth" }).check();
  await page.getByRole("checkbox", { name: "Normalize peak" }).check();
  await page.getByRole("checkbox", { name: "44.1 kHz compatibility" }).check();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export as WAV" }).click(),
  ]);

  const wavBytes = await downloadToBuffer(download);
  expect(readUint32LE(wavBytes, 24)).toBe(44100);
  expect(readUint16LE(wavBytes, 34)).toBe(24);
});

test("guitar lane still shows shapes and exports after deferred analysis UI loads", async ({ page }) => {
  test.setTimeout(180000);

  await gotoApp(page);
  await importAndAnalyzeFixture(page, "guitar-c-major-clean.wav");
  await switchLane(page, "Guitar");

  await expect(page.getByText(/shape 1 of/i)).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".chord-fretboard__diagram")).toBeVisible({ timeout: 10000 });

  const exportGroup = page.getByRole("group", { name: /export options/i });
  await expect(exportGroup).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Export as MIDI" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Export as WAV" })).toBeEnabled();
});
