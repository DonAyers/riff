import { expect, test } from "@playwright/test";

test("desktop layout keeps capture and analysis panes side by side", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const capturePane = page.getByRole("region", { name: /record a take or import audio/i });
  const analysisPane = page.getByRole("region", {
    name: /notes, chord, and timing/i,
  });

  await expect(capturePane).toBeVisible();
  await expect(analysisPane).toBeVisible();
  await expect(page.getByText(/ready for a take/i)).toBeVisible();

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