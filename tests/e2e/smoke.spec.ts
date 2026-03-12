import { expect, test } from "@playwright/test";
import { gotoApp, switchLane } from "./helpers";

test("landing page shows guitar-first capture and lane controls", async ({ page }) => {
  await gotoApp(page);

  await expect(page.getByRole("heading", { level: 1, name: /riff/i })).toBeVisible();
  await expect(page.getByLabel(/^Build /)).toBeVisible();
  await expect(page.getByRole("button", { name: /help — how riff works/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /import audio file/i })).toBeVisible();
  await expect(page.getByText(/auto-detect/i)).toBeVisible();
  await expect(page.getByText(/compress/i)).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: /instrument profile/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /default/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /guitar/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /piano/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /guitar/i })).toHaveAttribute("aria-checked", "true");

  await expect(page.getByText("Guitar focus")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Song Lane" })).toBeVisible();
  await expect(
    page.getByText(/record or import a take to surface notes, chord, and timeline analysis\./i)
  ).toBeVisible();

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
