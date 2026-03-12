import { expect, test } from "@playwright/test";
import { fixturePath, getImportFileInput, getSettingToggle, gotoApp } from "./helpers";

test("known clip transcribes and shows notes/chord", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page, { autoProcess: false });

  const autoCheckbox = getSettingToggle(page, "Auto-detect");
  await autoCheckbox.uncheck();

  await getImportFileInput(page).setInputFiles(fixturePath("known-c-major.wav"));
  await expect(page.getByRole("button", { name: /detect notes/i })).toBeEnabled({ timeout: 15000 });

  await page.getByRole("button", { name: /detect notes/i }).click();

  await expect(page.getByText("Notes in this take")).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip").first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip", { hasText: "E4" })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip", { hasText: "G4" })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".chord-name")).toContainText(/c/i);
  await expect(page.getByText(/detected key/i)).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("button", { name: /play midi preview/i })).toBeVisible({ timeout: 60000 });

  const c4Button = page.getByRole("button", { name: /play note c4/i }).first();
  await expect(c4Button).toBeVisible({ timeout: 60000 });
  await expect(c4Button).toBeEnabled();
  await c4Button.click();
});
