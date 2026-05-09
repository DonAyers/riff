import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";

test("guitar tuner can listen from the capture panel", async ({ page }) => {
  await gotoApp(page);

  const tuner = page.getByRole("region", { name: /guitar tuner/i });
  await expect(tuner).toBeVisible();
  await expect(tuner.getByText("Tune before you record")).toBeVisible();
  await expect(tuner.getByText(/eadgbe/i)).toBeVisible();

  await tuner.getByRole("button", { name: /start tuner/i }).click();
  await expect(tuner.getByRole("button", { name: /stop tuner/i })).toBeVisible();
  await expect(tuner.getByText(/play one string at a time|hz/i)).toBeVisible();
  await expect(tuner.getByRole("meter", { name: /tuning cents/i })).toBeVisible();

  await tuner.getByRole("button", { name: /stop tuner/i }).click();
  await expect(tuner.getByRole("button", { name: /start tuner/i })).toBeVisible();
});
