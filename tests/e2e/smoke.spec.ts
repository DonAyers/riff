import { expect, test } from "@playwright/test";
import { gotoApp, switchLane } from "./helpers";

test("landing page shows simplified recorder defaults and lane controls", async ({ page }) => {
  await gotoApp(page);

  await expect(page.getByRole("heading", { level: 1, name: /riff/i })).toBeVisible();
  await expect(page.getByLabel(/^Build /)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /help and about/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /import audio file/i })).toBeVisible();
  await expect(
    page.getByText("Capture an idea, then review the notes or chords in one place.")
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Capture" })).toBeVisible();
  await expect(page.getByText("Record live or import audio")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /analyze automatically/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /analyze now/i })).toBeVisible();
  await expect(page.getByText(/^Step 1$/)).toBeVisible();
  await expect(page.getByText(/^Step 2$/)).toBeVisible();

  const advancedOptionsToggle = page.getByRole("button", { name: /advanced options/i });
  await expect(advancedOptionsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("checkbox", { name: /save smaller audio files/i })).toHaveCount(0);
  await expect(page.getByRole("radiogroup", { name: /instrument mode/i })).toHaveCount(0);

  await expect(page.getByRole("heading", { level: 2, name: "Review notes" })).toBeVisible();
  await expect(
    page.getByText(/record or import something on the left, then come back here for notes, timing, and playback\./i)
  ).toBeVisible();

  await advancedOptionsToggle.click();
  await expect(advancedOptionsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("checkbox", { name: /save smaller audio files/i })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: /instrument mode/i })).toBeVisible();
  await expect(
    page.getByText(/use guitar for most guitar recordings\. choose full range for other instruments\./i)
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: /guitar/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /full range/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /piano/i })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /guitar/i })).toBeChecked();

  await page.getByRole("button", { name: /start recording/i }).click();
  await expect(page.getByRole("button", { name: /stop recording/i })).toHaveClass(/recording/);
  await expect(page.getByRole("status")).toHaveText("Recording live");
  await page.getByRole("button", { name: /stop recording/i }).click();

  await switchLane(page, "Guitar");
  await expect(page.getByRole("heading", { level: 2, name: "Review chords" })).toBeVisible();
  await expect(
    page.getByText(
      /record or import something on the left, then come back here for the key, chord changes, and guitar shapes\./i
    )
  ).toBeVisible();
});

test("first visit shows onboarding and help reopens it later", async ({ page }) => {
  await page.goto("/");

  const onboarding = page.getByRole("dialog", { name: /help and about riff/i });
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByRole("heading", { level: 2, name: /capture first\. review second\./i })).toBeVisible();
  await expect(onboarding.getByText(/^v.+ · .+$/)).toBeVisible();

  await onboarding.getByRole("button", { name: /got it/i }).click();
  await expect(onboarding).toBeHidden();

  await page.reload();
  await expect(page.getByRole("dialog", { name: /help and about riff/i })).toBeHidden();

  await page.getByRole("button", { name: /help and about/i }).click();
  await expect(page.getByRole("dialog", { name: /help and about riff/i })).toBeVisible();
});
