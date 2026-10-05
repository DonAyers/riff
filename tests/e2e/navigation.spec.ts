import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";

test("bottom tab bar moves between record, builder and tuner", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Record" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Builder" }).click();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(nav.getByRole("link", { name: "Builder" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Tuner" }).click();
  await expect(page).toHaveURL(/\/tuner$/);
  await expect(page.getByRole("region", { name: /guitar tuner/i })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/builder$/);

  await nav.getByRole("link", { name: "Record" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();
});

test("tab bar does not cover the record button on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await gotoApp(page);

  const navBox = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
  const recordBox = await page.getByRole("button", { name: /start recording/i }).boundingBox();

  expect(navBox && recordBox).toBeTruthy();
  expect(recordBox!.y + recordBox!.height).toBeLessThanOrEqual(navBox!.y);
});
