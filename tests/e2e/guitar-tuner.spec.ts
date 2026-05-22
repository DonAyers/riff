import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";

test("guitar tuner can listen from its dedicated route", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("link", { name: "Tuner" }).click();

  const tuner = page.getByRole("region", { name: /guitar tuner/i });
  await expect(tuner).toBeVisible();
  await expect(page).toHaveURL(/\/tuner$/);
  await expect(page.getByRole("heading", { level: 2, name: /guitar tuner/i })).toBeVisible();
  await expect(tuner.getByText(/eadgbe/i)).toBeVisible();

  await tuner.getByRole("button", { name: /start tuner/i }).click();
  await expect(tuner.getByRole("button", { name: /stop tuner/i })).toBeVisible();
  await expect(tuner.getByText("Play one string at a time")).toBeVisible();
  await expect(tuner.getByText(/hz/i).first()).toBeVisible();
  await expect(tuner.getByRole("meter", { name: /tuning cents/i })).toBeVisible();

  await tuner.getByRole("button", { name: /stop tuner/i }).click();
  await expect(tuner.getByRole("button", { name: /start tuner/i })).toBeVisible();
});
