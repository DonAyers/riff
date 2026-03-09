import { expect, test } from "@playwright/test";

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

  await page.goto("/");

  await page.getByRole("button", { name: /start recording/i }).click();

  await expect(page.getByText("Permission denied")).toBeVisible();

  const demoButton = page.getByRole("button", { name: /try demo take/i });
  await expect(demoButton).toBeVisible();
  await demoButton.click();

  await expect(page.getByText("Notes in this take")).toBeVisible();
  await expect(page.locator(".note-chip", { hasText: "C4" })).toBeVisible();
});
