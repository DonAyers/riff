import { expect, test } from "@playwright/test";
import { gotoApp, switchLane } from "./helpers";

test("landing page shows simplified recorder defaults and lane controls", async ({ page }) => {
  await gotoApp(page);

  await expect(page.getByRole("heading", { level: 1, name: /riff/i })).toBeVisible();
  await expect(page.getByLabel(/^Build /)).toBeVisible();
  await expect(page.getByRole("button", { name: /help — how riff works/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /import audio file/i })).toBeVisible();
  await expect(page.getByText("Record or import audio to see chords")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /analyze automatically/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /analyze now/i })).toBeVisible();

  const advancedOptionsToggle = page.getByRole("button", { name: /advanced options/i });
  await expect(advancedOptionsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("checkbox", { name: /save smaller audio files/i })).toHaveCount(0);
  await expect(page.getByRole("radiogroup", { name: /instrument mode/i })).toHaveCount(0);

  await expect(page.getByRole("heading", { level: 2, name: "Song Lane" })).toBeVisible();
  await expect(
    page.getByText(/record or import a take to surface notes, chord, and timeline analysis\./i)
  ).toBeVisible();

  await advancedOptionsToggle.click();
  await expect(advancedOptionsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("checkbox", { name: /save smaller audio files/i })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: /instrument mode/i })).toBeVisible();
  await expect(
    page.getByText(/use guitar for most guitar recordings\. choose full range for wider note coverage\./i)
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: /guitar/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /full range/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /piano/i })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /guitar/i })).toBeChecked();

  await page.getByRole("button", { name: /start recording/i }).click();
  await expect(page.getByRole("button", { name: /stop recording/i })).toHaveClass(/recording/);
  await expect(page.getByRole("status")).toHaveText("Recording live");
  await page.getByRole("button", { name: /stop recording/i }).click();

  await switchLane(page, "Chord");
  await expect(page.getByRole("heading", { level: 2, name: "Chord Lane" })).toBeVisible();
  await expect(
    page.getByText(
      /strum or import a chord and this panel will focus on chord identity and guitar-friendly voicings\./i
    )
  ).toBeVisible();
});

test("first visit shows onboarding and help reopens it later", async ({ page }) => {
  await page.goto("/");

  const onboarding = page.getByRole("dialog", { name: /how riff works/i });
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByRole("heading", { level: 2, name: /three steps\./i })).toBeVisible();

  await onboarding.getByRole("button", { name: /got it/i }).click();
  await expect(onboarding).toBeHidden();

  await page.reload();
  await expect(page.getByRole("dialog", { name: /how riff works/i })).toBeHidden();

  await page.getByRole("button", { name: /help — how riff works/i }).click();
  await expect(page.getByRole("dialog", { name: /how riff works/i })).toBeVisible();
});
