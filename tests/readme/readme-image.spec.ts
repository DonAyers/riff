import { expect, test } from "@playwright/test";
import { gotoApp } from "../e2e/helpers";
import {
  README_IMAGE_STYLES,
  README_IMAGE_VIEWPORT,
  getReadmeImageOutputPath,
} from "./imageCapture";

test("captures the README landing-page image", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(README_IMAGE_VIEWPORT);
  await gotoApp(page, { onboardingSeen: true });
  await page.addStyleTag({ content: README_IMAGE_STYLES });

  await expect(page.getByRole("heading", { level: 1, name: /riff/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Capture" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Review notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: /start recording/i })).toBeVisible();

  await page.screenshot({
    path: getReadmeImageOutputPath(),
    animations: "disabled",
    caret: "hide",
  });
});
