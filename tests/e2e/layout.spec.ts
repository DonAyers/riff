import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";

test("desktop layout keeps the mobile app frame centered instead of split panes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoApp(page);

  const appFrame = page.getByRole("region", { name: /riff recorder/i });
  const captureScreen = page.getByRole("region", { name: /capture/i });

  await expect(appFrame).toBeVisible();
  await expect(captureScreen).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Record" })).toBeVisible();
  await expect(page.getByRole("list", { name: /recording flow/i })).toHaveCount(0);
  await expect(page.getByRole("region", { name: /analysis/i })).toHaveCount(0);

  const frameBox = await appFrame.boundingBox();

  expect(frameBox).not.toBeNull();

  if (!frameBox) {
    throw new Error("Expected app frame to have a bounding box");
  }

  expect(frameBox.width).toBeLessThan(470);
  expect(Math.abs(frameBox.x + frameBox.width / 2 - 640)).toBeLessThan(80);

  const gridTemplateColumns = await page.locator(".app-main--flow").evaluate((element) => {
    return window.getComputedStyle(element).gridTemplateColumns;
  });

  expect(gridTemplateColumns.split(" ").length).toBe(1);
});

test("home record button stays centered in the recorder card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  const recorderCard = page.getByTestId("stage-record").locator(".recorder-card");
  const recordButton = recorderCard.getByRole("button", { name: "Start recording" });
  const importButton = recorderCard.getByRole("button", { name: "Import audio file" });

  await expect(recorderCard).toBeVisible();
  await expect(recordButton).toBeVisible();
  await expect(importButton).toBeVisible();

  const cardBox = await recorderCard.boundingBox();
  const recordBox = await recordButton.boundingBox();
  const importBox = await importButton.boundingBox();

  expect(cardBox).not.toBeNull();
  expect(recordBox).not.toBeNull();
  expect(importBox).not.toBeNull();

  if (!cardBox || !recordBox || !importBox) {
    throw new Error("Expected recorder controls to have bounding boxes");
  }

  const cardCenterX = cardBox.x + cardBox.width / 2;
  const recordCenterX = recordBox.x + recordBox.width / 2;

  expect(Math.abs(recordCenterX - cardCenterX)).toBeLessThan(2);
  expect(importBox.x).toBeGreaterThan(recordBox.x + recordBox.width / 2);
  expect(importBox.x + importBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);

  const buttonShadow = await recordButton.evaluate((element) => {
    return window.getComputedStyle(element).boxShadow;
  });

  expect(buttonShadow).not.toContain("inset");
});
