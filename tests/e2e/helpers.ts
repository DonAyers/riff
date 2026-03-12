import { expect, type Locator, type Page } from "@playwright/test";
import path from "node:path";

const FIXTURES_DIR = path.resolve(process.cwd(), "tests", "fixtures");

type InstrumentProfileStorage = "default" | "guitar";

interface GotoAppOptions {
  onboardingSeen?: boolean;
  autoProcess?: boolean;
  instrumentProfile?: InstrumentProfileStorage;
}

export async function gotoApp(page: Page, options: GotoAppOptions = {}): Promise<void> {
  const { onboardingSeen = true, autoProcess, instrumentProfile } = options;

  await page.addInitScript(
    ({ onboardingSeen, autoProcess, instrumentProfile }: GotoAppOptions) => {
      if (onboardingSeen) {
        localStorage.setItem("riff_onboarded", "1");
      } else {
        localStorage.removeItem("riff_onboarded");
      }

      if (typeof autoProcess === "boolean") {
        localStorage.setItem("riff:auto-process", autoProcess ? "true" : "false");
      }

      if (instrumentProfile) {
        localStorage.setItem("riff:instrument-profile", instrumentProfile);
      }
    },
    { onboardingSeen, autoProcess, instrumentProfile }
  );

  await page.goto("/");
}

export function getSettingToggle(page: Page, label: string): Locator {
  return page
    .locator("label.setting-toggle")
    .filter({ hasText: label })
    .locator('input[type="checkbox"]');
}

export async function setSettingToggle(page: Page, label: string, enabled: boolean): Promise<void> {
  const toggle = getSettingToggle(page, label);
  await expect(toggle).toHaveCount(1);

  if ((await toggle.isChecked()) === enabled) {
    return;
  }

  if (enabled) {
    await toggle.check();
  } else {
    await toggle.uncheck();
  }
}

export function fixturePath(fileName: string): string {
  return path.join(FIXTURES_DIR, fileName);
}

export function getImportFileInput(page: Page): Locator {
  return page.locator(".import-file-input");
}

export async function importFixture(page: Page, fileName = "known-c-major.wav"): Promise<void> {
  await getImportFileInput(page).setInputFiles(fixturePath(fileName));
}

export async function waitForAnalysisResults(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 2, name: "Notes in this take" })
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".note-chip").first()).toBeVisible({ timeout: 90000 });
}

export async function importAndAnalyzeFixture(
  page: Page,
  fileName = "known-c-major.wav"
): Promise<void> {
  await setSettingToggle(page, "Auto-detect", true);
  await importFixture(page, fileName);
  await waitForAnalysisResults(page);
}

export async function selectDetectionFocus(
  page: Page,
  profileLabel: "Full range" | "Guitar"
): Promise<void> {
  const profile = page.getByRole("radio", { name: profileLabel });
  await profile.check();
  await expect(profile).toBeChecked();
}

export async function switchLane(page: Page, lane: "Song" | "Chord"): Promise<void> {
  const tab = page.getByRole("tab", { name: lane });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}
