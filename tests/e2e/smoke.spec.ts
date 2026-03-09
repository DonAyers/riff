import { expect, test } from "@playwright/test";

test("landing page shows key recording controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: /riff/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();
  await expect(page.getByText(/capture a take\. hear what you played\./i)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /detect notes after recording/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /compress saved takes/i })).toBeVisible();
});
