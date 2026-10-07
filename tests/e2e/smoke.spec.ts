import { expect, test } from "@playwright/test";
import { fixturePath, getImportFileInput, gotoApp } from "./helpers";

test("landing page behaves like a record-first app flow", async ({ page }) => {
  await gotoApp(page);

  await expect(page.getByRole("heading", { level: 1, name: /riff/i })).toBeVisible();
  await expect(page.getByLabel(/^Build /)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Builder" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tuner" })).toBeVisible();
  await expect(page.getByRole("button", { name: /help and about/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /import audio file/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /guitar tuner/i })).toHaveCount(0);
  await expect(
    page.getByText("A pocket studio for turning one take into playable chords.")
  ).toBeHidden();
  await expect(page.getByRole("heading", { level: 2, name: "Record" })).toBeVisible();
  await expect(page.getByText("Record live or import audio")).toBeVisible();
  await expect(page.getByRole("list", { name: /recording flow/i })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /analyze automatically/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /analyze now/i })).toHaveCount(0);

  await page.getByRole("button", { name: /start recording/i }).click();
  await expect(page.getByRole("button", { name: /stop recording/i })).toHaveClass(/recording/);
  await expect(page.getByRole("status")).toHaveText("Recording live");
  await page.getByRole("button", { name: /stop recording/i }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Take check" })).toBeVisible();
  await expect(page.getByText(/keep this take/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /play recording/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /retake/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^analyze$/i })).toBeVisible();

  await page.getByRole("button", { name: /retake/i }).click();
  await expect(page.getByRole("alertdialog", { name: /delete this take/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /next time, retake immediately/i })).toBeVisible();
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Record" })).toBeVisible();
});

test("song builder route has mobile views and sequence workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoApp(page);

  await page.getByRole("link", { name: "Builder" }).click();

  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByRole("navigation", { name: /builder mobile views/i, includeHidden: true })).toBeAttached();
  await expect(page.getByRole("heading", { level: 2, name: /record chords/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /import audio file/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /build the sequence/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /add a chord by hand/i })).toBeVisible();
  await expect(page.getByText(/record or import chords/i)).toBeVisible();
  await expect(page.getByRole("region", { name: /guitar tuner/i })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2)).toBe(true);

  const recordBox = await page.getByRole("region", { name: /builder capture/i }).boundingBox();
  const sequenceBox = await page.getByRole("region", { name: /builder chord sequence/i }).boundingBox();
  expect(recordBox).not.toBeNull();
  expect(sequenceBox).not.toBeNull();
  expect(recordBox!.x).toBeLessThan(sequenceBox!.x);
  expect(recordBox!.y).toBeLessThanOrEqual(sequenceBox!.y + 4);

  await page.goto("/builder");
  await expect(page.getByRole("heading", { level: 2, name: /build the sequence/i })).toBeVisible();
});

test("song builder mobile frame starts on record without vertical page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  await page.getByRole("link", { name: "Builder" }).click();

  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByRole("navigation", { name: /builder mobile views/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /record chords/i })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2)).toBe(true);

  const recordBox = await page.getByRole("region", { name: /builder capture/i }).boundingBox();
  expect(recordBox).not.toBeNull();
  expect(recordBox!.x).toBeGreaterThanOrEqual(0);
  expect(recordBox!.x).toBeLessThan(24);
});

test("song builder can add a manual chord and apply a suggestion", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("link", { name: "Builder" }).click();
  await page.getByRole("radio", { name: "A", exact: true }).click();
  await page.getByRole("radio", { name: "Minor", exact: true }).click();
  await page.getByRole("button", { name: /add a minor to builder sequence/i }).click();

  await expect(page.getByRole("button", { name: /focus a minor/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /focused builder chord a minor/i })).toBeVisible();
  await page.getByRole("button", { name: /Am7 minor seventh/i }).click();

  await expect(page.getByRole("button", { name: /focus a minor 7/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /focused builder chord a minor 7/i })).toBeVisible();
});

test("song builder can save, reload, and export a manual song", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("link", { name: "Builder" }).click();
  await page.getByRole("radio", { name: "A", exact: true }).click();
  await page.getByRole("radio", { name: "Minor", exact: true }).click();
  await page.getByRole("button", { name: /add a minor to builder sequence/i }).click();
  await page.getByRole("textbox", { name: /builder song title/i }).fill("Pocket Chorus");
  await page.getByRole("button", { name: /save builder song/i }).click();

  await expect(page.getByRole("status")).toContainText(/saved pocket chorus/i);
  await expect(page.getByRole("button", { name: /load pocket chorus/i })).toBeVisible();

  await page.getByRole("button", { name: /delete a minor/i }).click();
  await expect(page.getByText(/no sequence yet/i)).toBeVisible();

  await page.getByRole("button", { name: /load pocket chorus/i }).click();
  await expect(page.getByRole("button", { name: /focus a minor/i })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/loaded pocket chorus/i);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /export builder song as midi/i }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Pocket-Chorus.mid");
});

test("song builder can zoom a chord and apply a suggestion", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page, { autoProcess: false, instrumentProfile: "guitar" });

  await page.getByRole("link", { name: "Builder" }).click();
  await getImportFileInput(page).setInputFiles(fixturePath("guitar-c-major-clean.wav"));
  await expect(page.getByRole("button", { name: /analyze now/i })).toBeEnabled({ timeout: 15000 });
  await page.getByRole("button", { name: /analyze now/i }).click();

  const sequence = page.getByRole("list", { name: /detected chord sequence/i });
  await expect(sequence).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole("button", { name: /stop builder preview immediately/i })).toBeDisabled();
  await page.getByRole("button", { name: /keep builder preview looping/i }).click();
  await expect(page.getByRole("button", { name: /turn off builder preview loop/i })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByRole("button", { name: /focus c major/i }).first().click();
  await expect(page.getByRole("region", { name: /focused builder chord c major/i })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/loop stays live/i);

  await page.getByRole("button", { name: /Cadd9 added ninth/i }).click();

  await expect(page.getByRole("button", { name: /focus c add9/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /focused builder chord c add9/i })).toBeVisible();
});

test("guitar tuner lives on its own route", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("riff_onboarded", "1");
  });

  await page.goto("/tuner");

  await expect(page.getByRole("heading", { level: 1, name: /riff/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /guitar tuner/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /guitar tuner/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start tuner/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start recording/i })).toHaveCount(0);
  await expect(page.getByRole("meter", { name: /tuning cents/i })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /tuning/i })).toHaveValue("standard");

  await page.getByRole("link", { name: "Record" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 2, name: "Record" })).toBeVisible();
});

test("pending recording survives visiting the tuner route", async ({ page }) => {
  await gotoApp(page, { autoProcess: false });

  await page.getByRole("button", { name: /start recording/i }).click();
  await expect(page.getByRole("button", { name: /stop recording/i })).toHaveClass(/recording/);
  await expect(page.getByRole("status")).toHaveText("Recording live");
  await page.getByRole("button", { name: /stop recording/i }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Take check" })).toBeVisible({ timeout: 15000 });

  await page.getByRole("link", { name: "Tuner" }).click();
  await expect(page.getByRole("region", { name: /guitar tuner/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start recording/i })).toHaveCount(0);

  await page.getByRole("link", { name: "Record" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Take check" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^analyze$/i })).toBeVisible();
});

test("first visit shows onboarding and help reopens it later", async ({ page }) => {
  await page.goto("/");

  const onboarding = page.getByRole("dialog", { name: /help and about riff/i });
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByRole("heading", { level: 2, name: /capture first\. review second\./i })).toBeVisible();
  await expect(onboarding.getByRole("button", { name: /close/i })).toBeVisible();

  await onboarding.getByRole("button", { name: /got it/i }).click();
  await expect(onboarding).toBeHidden();

  await page.reload();
  await expect(page.getByRole("dialog", { name: /help and about riff/i })).toBeHidden();

  await page.getByRole("button", { name: /help and about/i }).click();
  await expect(page.getByRole("dialog", { name: /help and about riff/i })).toBeVisible();
});
