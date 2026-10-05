import { expect, test, type Page } from "@playwright/test";
import { gotoApp } from "./helpers";

/** Replaces the microphone with a pure tone so the real analyser + pitch detector run end to end. */
async function useToneAsMicrophone(page: Page, frequencyHz: number) {
  await page.addInitScript((toneHz: number) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = toneHz;
      gain.gain.value = 0.5;
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      await context.resume();
      return destination.stream;
    };
  }, frequencyHz);
}

test("guitar tuner can listen from its dedicated route", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("link", { name: "Tuner" }).click();

  const tuner = page.getByRole("region", { name: /guitar tuner/i });
  await expect(tuner).toBeVisible();
  await expect(page).toHaveURL(/\/tuner$/);
  await expect(page.getByRole("heading", { level: 2, name: /guitar tuner/i })).toBeVisible();

  await tuner.getByRole("button", { name: /start tuner/i }).click();
  await expect(tuner.getByRole("button", { name: /stop tuner/i })).toBeVisible();
  await expect(tuner.getByRole("meter", { name: /tuning cents/i })).toBeVisible();

  await tuner.getByRole("button", { name: /stop tuner/i }).click();
  await expect(tuner.getByRole("button", { name: /start tuner/i })).toBeVisible();
});

test("tuner reads a flat A string and tells the player to tune up", async ({ page }) => {
  await useToneAsMicrophone(page, 107);
  await gotoApp(page);
  await page.goto("/tuner");

  const tuner = page.getByRole("region", { name: /guitar tuner/i });
  await tuner.getByRole("button", { name: /start tuner/i }).click();

  await expect(tuner.getByTestId("tuner-note")).toHaveText("A2");
  await expect(tuner.getByTestId("tuner-hint")).toHaveText("Tune up");
  await expect(tuner.getByRole("meter", { name: /tuning cents/i })).toHaveAttribute(
    "aria-valuetext",
    /flat/
  );
});

test("tuner follows a drop D low string and string lock", async ({ page }) => {
  await useToneAsMicrophone(page, 73.42);
  await gotoApp(page);
  await page.goto("/tuner");

  const tuner = page.getByRole("region", { name: /guitar tuner/i });
  await tuner.getByRole("combobox", { name: /tuning/i }).selectOption("drop-d");
  await tuner.getByRole("button", { name: /start tuner/i }).click();

  await expect(tuner.getByTestId("tuner-note")).toHaveText("D2");
  await expect(tuner.getByTestId("tuner-hint")).toHaveText("In tune");

  // Back to standard, locked on low E: the D2 string now needs tuning up a whole step.
  await tuner.getByRole("combobox", { name: /tuning/i }).selectOption("standard");
  await tuner.getByRole("button", { name: /^Low E string/ }).click();
  await expect(tuner.getByRole("button", { name: /^Low E string \(E2\), locked/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(tuner.getByTestId("tuner-note")).toHaveText("E2");
  await expect(tuner.getByTestId("tuner-hint")).toHaveText("Tune up");
});
