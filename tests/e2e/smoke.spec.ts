import { expect, test } from "@playwright/test";

test("landing page shows key recording controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /riff/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /auto-process after recording/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /compress saved audio/i })).toBeVisible();
});
