import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";

test.beforeEach(async ({ page }) => {
  // A steady tone stands in for the guitar so the real worklet capture path runs.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 220;
      oscillator.connect(destination);
      oscillator.start();
      await context.resume();
      return destination.stream;
    };
  });
});

test("looper records a first loop and layers a second track in time", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Looper" }).click();
  await expect(page).toHaveURL(/\/looper$/);

  const looper = page.getByRole("region", { name: "Looper" });
  await expect(looper.getByTestId("loop-length")).toHaveText("No loop yet");
  await expect(looper.getByRole("button", { name: "Play loop" })).toBeDisabled();

  await looper.getByRole("button", { name: "Record track 1" }).click();
  await expect(looper.getByTestId("track-1-status")).toHaveText("Recording");
  await expect(looper.getByRole("button", { name: "Record track 2" })).toBeDisabled();

  await page.waitForTimeout(1200);
  await looper.getByRole("button", { name: "Close loop on track 1" }).click();

  await expect(looper.getByTestId("track-1-status")).toHaveText("Looping");
  await expect(looper.getByTestId("loop-length")).toHaveText(/^Loop 0:01\.\d$/);
  await expect(looper.getByRole("button", { name: "Stop loop" })).toBeVisible();

  await looper.getByRole("button", { name: "Record track 2" }).click();
  await expect(looper.getByTestId("track-2-status")).toHaveText(/Starts at the top|Recording/);
  await expect(looper.getByTestId("track-2-status")).toHaveText("Looping", { timeout: 6000 });

  await looper.getByRole("button", { name: "Mute track 2" }).click();
  await expect(looper.getByRole("button", { name: "Mute track 2" })).toHaveAttribute("aria-pressed", "true");

  await looper.getByRole("button", { name: "Stop loop" }).click();
  await expect(looper.getByRole("button", { name: "Play loop" })).toBeVisible();

  await looper.getByRole("button", { name: "Clear all" }).click();
  await expect(looper.getByTestId("loop-length")).toHaveText("No loop yet");
  await expect(looper.getByTestId("track-1-status")).toHaveText("Empty");
});
