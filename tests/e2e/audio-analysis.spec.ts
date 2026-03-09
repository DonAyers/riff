import { expect, test } from "@playwright/test";

test("known clip transcribes and shows notes/chord", async ({ page }) => {
  test.setTimeout(120000);

  await page.addInitScript(() => {
    localStorage.setItem("riff:auto-process", "false");
  });

  await page.goto("/");

  await page.getByRole("checkbox", { name: /auto-process after recording/i }).uncheck();

  await page.getByRole("button", { name: /start recording/i }).click();
  await expect(page.getByText("Listening…")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(3800);
  await page.getByRole("button", { name: /stop recording/i }).click();
  await expect(page.getByRole("button", { name: /analyze clip/i })).toBeEnabled({ timeout: 15000 });

  await page.getByRole("button", { name: /analyze clip/i }).click();

  await expect(page.getByText("Notes Detected")).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip").first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip", { hasText: "E4" })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip", { hasText: "G4" })).toBeVisible({ timeout: 60000 });

  const c4Button = page.getByRole("button", { name: /play note c4/i }).first();
  await expect(c4Button).toBeVisible({ timeout: 60000 });
  await expect(c4Button).toBeEnabled();
  await c4Button.click();
});
