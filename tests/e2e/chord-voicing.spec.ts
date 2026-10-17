import { expect, test } from "@playwright/test";
import { gotoApp, importAndAnalyzeFixture } from "./helpers";

test("a strummed open C shows the shape it was played with and its voicing", async ({ page }) => {
  test.setTimeout(180000);

  await gotoApp(page, { autoProcess: false, instrumentProfile: "guitar" });
  await importAndAnalyzeFixture(page, "open-c-strum.wav");

  const explorer = page.getByTestId("chord-map-explorer");
  await expect(explorer.getByText("Played shape")).toBeVisible();
  await expect(explorer.getByTestId("voicing-summary")).toContainText("Root position");
  await expect(explorer.getByTestId("voicing-summary")).toContainText("C3 E3 G3 C4 E4");
});

test("a strummed D/F# is named with its F# bass and shown as an inversion", async ({ page }) => {
  test.setTimeout(180000);

  await gotoApp(page, { autoProcess: false, instrumentProfile: "guitar" });
  await importAndAnalyzeFixture(page, "d-over-f-sharp-strum.wav");

  const explorer = page.getByTestId("chord-map-explorer");
  await expect(explorer.getByTestId("chord-map-card").first()).toContainText("D Major/F#");
  await expect(explorer.getByTestId("voicing-summary")).toContainText("1st inversion");
});
