import { expect, test } from "@playwright/test";
import { fixturePath, getImportFileInput, gotoApp, openNotesScreen } from "./helpers";

test("known clip transcribes and shows notes/chord", async ({ page }) => {
  test.setTimeout(180000);

  await gotoApp(page, { autoProcess: false, instrumentProfile: "default" });

  await getImportFileInput(page).setInputFiles(fixturePath("known-c-major.wav"));
  await expect(page.getByRole("heading", { level: 2, name: /take check/i })).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: /^analyze$/i }).click();

  await expect(page.getByTestId("chord-map-explorer")).toBeVisible({ timeout: 120000 });
  await expect(page.getByRole("button", { name: /explore chord c major/i })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText(/detected key/i)).toBeVisible({ timeout: 120000 });

  await openNotesScreen(page);
  await expect(page.getByText("Notes in this take")).toBeVisible({ timeout: 120000 });
  await expect(page.locator(".note-chip").first()).toBeVisible({ timeout: 120000 });
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible({ timeout: 120000 });
  await expect(page.locator(".note-chip", { hasText: "E4" })).toBeVisible({ timeout: 120000 });
  await expect(page.locator(".note-chip", { hasText: "G4" })).toBeVisible({ timeout: 120000 });

  const c4Button = page.getByRole("button", { name: /play note c4/i }).first();
  await expect(c4Button).toBeVisible({ timeout: 120000 });
  await expect(c4Button).toBeEnabled();
  await c4Button.click();

  await expect(
    page.locator(".piano-roll").getByRole("button", { name: /play midi preview/i })
  ).toBeVisible({ timeout: 120000 });
});
