import { expect, test } from "@playwright/test";
import { fixturePath, getImportFileInput, getSettingToggle, gotoApp } from "./helpers";

test("known clip transcribes and shows notes/chord", async ({ page }) => {
  test.setTimeout(120000);

  await gotoApp(page, { autoProcess: false, instrumentProfile: "default" });

  const autoCheckbox = getSettingToggle(page, "Auto-detect");
  await autoCheckbox.uncheck();

  await getImportFileInput(page).setInputFiles(fixturePath("known-c-major.wav"));
  await expect(page.getByRole("button", { name: /analyze now/i })).toBeEnabled({ timeout: 15000 });

  await page.getByRole("button", { name: /analyze now/i }).click();

  await expect(page.getByText("Notes in this take")).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip").first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip", { hasText: "E4" })).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".note-chip", { hasText: "G4" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("button", { name: /^select chord c major$/i })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/detected key/i)).toBeVisible({ timeout: 60000 });
  await expect(
    page.locator(".piano-roll").getByRole("button", { name: /play midi preview/i })
  ).toBeVisible({ timeout: 60000 });

  const c4Button = page.getByRole("button", { name: /play note c4/i }).first();
  await expect(c4Button).toBeVisible({ timeout: 60000 });
  await expect(c4Button).toBeEnabled();
  await c4Button.click();
});
