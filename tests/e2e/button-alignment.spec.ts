import { expect, test, type Page } from "@playwright/test";
import { gotoApp } from "./helpers";

/**
 * Finds button-like controls labelled by one line of text or a single icon and reports
 * any whose letters or icon sit more than 1.5px off the control's centre (either axis).
 */
async function offCentreLabels(page: Page) {
  return page.evaluate(() => {
    const controls = document.querySelectorAll<HTMLElement>(
      "button, [role='button'], label:has(> input[type='radio']), label:has(> input[type='checkbox'])"
    );
    const problems: string[] = [];
    for (const control of controls) {
      const box = control.getBoundingClientRect();
      if (box.width < 8 || box.height < 8 || getComputedStyle(control).visibility === "hidden") continue;
      const texts: Text[] = [];
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (node.textContent?.trim()) texts.push(node);
      }
      const style = getComputedStyle(control);
      const border = (side: string) => parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0;
      const innerTop = box.top + border("top");
      const innerBottom = box.bottom - border("bottom");
      const innerLeft = box.left + border("left");
      const innerRight = box.right - border("right");
      const icons = control.querySelectorAll("svg");

      // Icon-only controls: the icon should sit in the middle.
      if (texts.length === 0 && icons.length === 1) {
        const icon = icons[0].getBoundingClientRect();
        const dy = (icon.top + icon.bottom) / 2 - (innerTop + innerBottom) / 2;
        const dx = (icon.left + icon.right) / 2 - (innerLeft + innerRight) / 2;
        if (Math.abs(dy) > 1.5 || Math.abs(dx) > 1.5) {
          problems.push(`${control.getAttribute("aria-label")} icon (dx ${dx.toFixed(1)}, dy ${dy.toFixed(1)})`);
        }
        continue;
      }

      // Single-label controls: one text node rendered on one line.
      if (texts.length !== 1) continue;
      const range = document.createRange();
      range.selectNodeContents(texts[0]);
      const lines = range.getClientRects();
      if (lines.length !== 1) continue;
      const line = lines[0];
      // Measure the glyphs' ink, not the line box: fonts sit their letters
      // unevenly inside the line box, and the ink is what people see.
      const textStyle = getComputedStyle(texts[0].parentElement!);
      const context = document.createElement("canvas").getContext("2d")!;
      context.font = `${textStyle.fontStyle} ${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`;
      const label = texts[0].textContent!.trim();
      const metrics = context.measureText(textStyle.textTransform === "uppercase" ? label.toUpperCase() : label);
      const contentHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
      const baseline = line.top + (line.height - contentHeight) / 2 + metrics.fontBoundingBoxAscent;
      const text = {
        top: baseline - metrics.actualBoundingBoxAscent,
        bottom: baseline + metrics.actualBoundingBoxDescent,
        left: line.left,
        right: line.right,
      };
      // The label's own wrapper may hold an icon beside the text, so only judge
      // the axis the text shares with nothing else.
      const hasIcon = icons.length > 0 || control.querySelector("img") !== null;
      const dy = (text.top + text.bottom) / 2 - (innerTop + innerBottom) / 2;
      const dx = (text.left + text.right) / 2 - (innerLeft + innerRight) / 2;
      const textAlign = getComputedStyle(texts[0].parentElement!).textAlign;
      const meantCentred = textAlign === "center" || style.justifyContent === "center";
      if (Math.abs(dy) > 1.5 || (!hasIcon && meantCentred && Math.abs(dx) > 1.5)) {
        problems.push(`${texts[0].textContent!.trim()} (dx ${dx.toFixed(1)}, dy ${dy.toFixed(1)})`);
      }
    }
    return problems;
  });
}

// Each route with a control that only appears once its lazy chunk has rendered.
const ROUTES = [
  ["/", { role: "button", name: /start recording/i }],
  ["/builder", { role: "button", name: /add .* to builder sequence/i }],
  ["/tuner", { role: "button", name: /start tuner/i }],
  ["/looper", { role: "button", name: /record track 1/i }],
  ["/settings", { role: "radio", name: "Light" }],
] as const;

for (const theme of ["light", "dark"] as const) {
  test(`button labels are centred on every screen in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);

    for (const [route, ready] of ROUTES) {
      await page.goto(route);
      await expect(page.getByRole(ready.role, { name: ready.name }).first()).toBeAttached();
      await page.evaluate(() => document.fonts.ready);
      expect(await offCentreLabels(page), route).toEqual([]);
    }

    // States with their own controls: the help sheet and the Builder chord lab.
    await page.goto("/");
    await page.getByRole("button", { name: /help/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await offCentreLabels(page), "help sheet").toEqual([]);

    await page.goto("/builder");
    await page.getByRole("radio", { name: "A", exact: true }).click();
    await page.getByRole("button", { name: /add a major to builder sequence/i }).click();
    await expect(page.getByRole("region", { name: /focused builder chord/i })).toBeVisible();
    expect(await offCentreLabels(page), "builder chord lab").toEqual([]);
  });
}
