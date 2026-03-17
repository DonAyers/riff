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

function readSynchsafeInt(buffer: Buffer, offset: number): number {
  return (
    ((buffer[offset] ?? 0) << 21)
    | ((buffer[offset + 1] ?? 0) << 14)
    | ((buffer[offset + 2] ?? 0) << 7)
    | (buffer[offset + 3] ?? 0)
  );
}

function readMp3SampleRate(buffer: Buffer): number {
  let offset = 0;

  if (buffer.subarray(0, 3).toString("ascii") === "ID3") {
    offset = 10 + readSynchsafeInt(buffer, 6);
  }

  for (let index = offset; index < buffer.length - 4; index += 1) {
    const byte1 = buffer[index];
    const byte2 = buffer[index + 1];
    if (byte1 !== 0xff || (byte2 & 0xe0) !== 0xe0) {
      continue;
    }

    const versionBits = (byte2 >> 3) & 0x03;
    const sampleRateIndex = (buffer[index + 2] >> 2) & 0x03;
    const sampleRateTable: Record<number, readonly [number, number, number]> = {
      0b00: [11025, 12000, 8000],
      0b10: [22050, 24000, 16000],
      0b11: [44100, 48000, 32000],
    };
    const versionRates = sampleRateTable[versionBits];
    if (!versionRates || sampleRateIndex === 0b11) {
      continue;
    }

    return versionRates[sampleRateIndex]!;
  }

  throw new Error("Could not determine MP3 sample rate");
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

test("MP3 export preserves the imported native sample rate", async ({ page }) => {
  test.setTimeout(180000);

  await gotoApp(page);
  await importAndAnalyzeFixture(page, "known-c-major.wav");

  const mp3Btn = page.getByRole("button", { name: "Export as MP3" });
  await expect(mp3Btn).toBeEnabled({ timeout: 10000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    mp3Btn.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.mp3$/);
  const mp3Bytes = await downloadToBuffer(download);
  expect(readMp3SampleRate(mp3Bytes)).toBeGreaterThan(22050);
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
