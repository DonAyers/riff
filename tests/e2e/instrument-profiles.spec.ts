import { expect, test } from "@playwright/test";
import {
  gotoApp,
  importFixture,
  openAdvancedOptions,
  openNotesScreen,
  waitForAnalysisResults,
} from "./helpers";

async function importWithGuitarDefaults(
  page: import("@playwright/test").Page,
  fixtureFileName: string,
) {
  await gotoApp(page);
  await importFixture(page, fixtureFileName);
  await expect(page.getByRole("heading", { level: 2, name: /take check/i })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /^analyze$/i }).click();
  await waitForAnalysisResults(page);
}

test.describe("guitar-first recorder e2e", () => {
  test.setTimeout(120000);

  test("advanced options keep the recorder guitar-first", async ({ page }) => {
    await gotoApp(page);
    await page.getByRole("link", { name: "Builder" }).click();

    await openAdvancedOptions(page);

    await expect(
      page.getByText("Guitar mode is locked in for now so chord detection can be tuned around real guitar takes.")
    ).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Instrument mode" })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Guitar" })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Full range" })).toHaveCount(0);
  });

  test("guitar-first defaults import clean guitar C major and detect notes", async ({ page }) => {
    await importWithGuitarDefaults(
      page,
      "guitar-c-major-clean.wav",
    );

    await openNotesScreen(page);
    await expect(page.locator(".note-chip")).not.toHaveCount(0);
  });

  test("stored legacy full-range preference stays hidden from the guitar-first UI", async ({ page }) => {
    await gotoApp(page, { instrumentProfile: "default" });
    await page.getByRole("link", { name: "Builder" }).click();

    await openAdvancedOptions(page);

    await expect(
      page.getByText("Guitar mode is locked in for now so chord detection can be tuned around real guitar takes.")
    ).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Instrument mode" })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Full range" })).toHaveCount(0);
  });
});
