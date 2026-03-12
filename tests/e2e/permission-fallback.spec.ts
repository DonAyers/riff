import { expect, test } from "@playwright/test";
import { gotoApp, waitForAnalysisResults } from "./helpers";

test("shows demo analysis fallback when microphone permission is denied", async ({ page }) => {
  await page.addInitScript(() => {
    const denied = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: denied,
      },
    });
  });

  await gotoApp(page);

  await page.getByRole("button", { name: /start recording/i }).click();

  await expect(page.getByText("Permission denied")).toBeVisible();

  const demoButton = page.getByRole("button", { name: /try demo take/i });
  await expect(demoButton).toBeVisible();
  await demoButton.click();

  await waitForAnalysisResults(page);
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible();
  await expect(page.getByRole("button", { name: /play recording/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /play midi preview/i })).toBeVisible();
});
