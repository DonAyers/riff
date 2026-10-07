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

test("looper trims the first loop and undoes a layer", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Looper" }).click();
  const looper = page.getByRole("region", { name: "Looper" });

  await looper.getByRole("button", { name: "Record track 1" }).click();
  await expect(looper.getByTestId("track-1-status")).toHaveText("Recording");
  await page.waitForTimeout(1200);
  await looper.getByRole("button", { name: "Close loop on track 1" }).click();
  await expect(looper.getByTestId("track-1-status")).toHaveText("Looping");

  const edges = looper.getByRole("group", { name: "Loop edges" });
  await expect(edges).toBeVisible();
  await expect(looper.getByTestId("loop-end-offset")).toHaveText("0 ms");
  const lengthBefore = await looper.getByTestId("loop-length").textContent();

  await looper.getByRole("slider", { name: "Loop end offset in milliseconds" }).fill("500");
  await expect(looper.getByTestId("loop-end-offset")).toHaveText("+500 ms");
  await expect(looper.getByTestId("loop-length")).not.toHaveText(lengthBefore ?? "");

  await looper.getByRole("button", { name: "Move loop start 10 ms earlier" }).click();
  await expect(looper.getByTestId("loop-start-offset")).toHaveText("−10 ms");

  await looper.getByRole("button", { name: "Reset loop edges" }).click();
  await expect(looper.getByTestId("loop-end-offset")).toHaveText("0 ms");
  await expect(looper.getByTestId("loop-start-offset")).toHaveText("0 ms");
  await expect(looper.getByTestId("loop-length")).toHaveText(lengthBefore ?? "");

  // A second layer locks the edges; undoing it unlocks them again.
  await looper.getByRole("button", { name: "Record track 2" }).click();
  await expect(edges).toBeHidden();
  await expect(looper.getByTestId("track-2-status")).toHaveText("Looping", { timeout: 6000 });
  await looper.getByRole("button", { name: "Undo last take" }).click();
  await expect(looper.getByTestId("track-2-status")).toHaveText("Empty");
  await expect(edges).toBeVisible();
});

test("looper counts in on the click and closes the loop on a bar line", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Looper" }).click();
  const looper = page.getByRole("region", { name: "Looper" });

  await looper.getByRole("button", { name: "Click" }).click();
  await expect(looper.getByRole("button", { name: "Click" })).toHaveAttribute("aria-pressed", "true");
  // 240 BPM in 4/4: one bar is exactly one second.
  const bpm = looper.getByRole("spinbutton", { name: "Tempo in beats per minute" });
  await bpm.fill("240");
  await bpm.press("Enter");
  await expect(bpm).toHaveValue("240");

  await looper.getByRole("button", { name: "Record track 1" }).click();
  await expect(looper.getByTestId("track-1-status")).toHaveText("Count-in");
  await expect(looper.getByTestId("track-1-status")).toHaveText("Recording", { timeout: 3000 });
  await page.waitForTimeout(1100);
  await looper.getByRole("button", { name: "Close loop on track 1" }).click();

  await expect(looper.getByTestId("track-1-status")).toHaveText("Looping", { timeout: 4000 });
  await expect(looper.getByTestId("loop-length")).toHaveText(/^Loop 0:0[12]\.0$/);
  await expect(looper.getByTestId("loop-tempo")).toHaveText(/^240 BPM · [12] bars?$/);

  await looper.getByRole("button", { name: "Clear all" }).click();
  await expect(looper.getByTestId("loop-length")).toHaveText("No loop yet");
  await expect(bpm).toBeEnabled();
});

test("looper fits a tempo to a freely played loop", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Looper" }).click();
  const looper = page.getByRole("region", { name: "Looper" });

  await looper.getByRole("button", { name: "Record track 1" }).click();
  await page.waitForTimeout(2000);
  await looper.getByRole("button", { name: "Close loop on track 1" }).click();
  await expect(looper.getByTestId("track-1-status")).toHaveText("Looping");

  await looper.getByRole("button", { name: "Fit tempo" }).click();
  await expect(looper.getByTestId("loop-tempo")).toHaveText(/BPM/);
  await expect(looper.getByRole("button", { name: "Click" })).toHaveAttribute("aria-pressed", "true");
  await looper.getByRole("button", { name: "Halve the tempo" }).click();
  await expect(looper.getByTestId("loop-tempo")).toHaveText(/BPM/);
});
