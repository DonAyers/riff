import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";

test("desktop layout keeps capture and analysis panes side by side", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoApp(page);

  const capturePane = page.getByRole("region", { name: /capture/i });
  const analysisPane = page.getByRole("region", {
    name: /analysis/i,
  });

  await expect(capturePane).toBeVisible();
  await expect(analysisPane).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Capture" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Review notes" })).toBeVisible();
  await expect(page.getByText(/nothing to review yet/i)).toBeVisible();

  const captureBox = await capturePane.boundingBox();
  const analysisBox = await analysisPane.boundingBox();

  expect(captureBox).not.toBeNull();
  expect(analysisBox).not.toBeNull();

  if (!captureBox || !analysisBox) {
    throw new Error("Expected capture and analysis panes to have bounding boxes");
  }

  expect(analysisBox.x).toBeGreaterThan(captureBox.x + 120);
  expect(Math.abs(captureBox.y - analysisBox.y)).toBeLessThan(80);

  const gridTemplateColumns = await page.locator(".app-main").evaluate((element) => {
    return window.getComputedStyle(element).gridTemplateColumns;
  });

  expect(gridTemplateColumns.split(" ").length).toBeGreaterThan(1);
});
