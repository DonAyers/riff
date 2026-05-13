import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";

test("guitar tuner can listen from the capture panel", async ({ page }) => {
  await page.addInitScript(() => {
    const sampleRate = 44100;
    const testFrequency = 120;
    let sampleOffset = 0;

    const fakeStream = {
      getTracks: () => [{ stop: () => undefined }],
    };

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => fakeStream,
      },
    });

    class MockAnalyserNode {
      fftSize = 0;
      smoothingTimeConstant = 0;

      disconnect() {
        // no-op
      }

      getFloatTimeDomainData(buffer: Float32Array) {
        for (let i = 0; i < buffer.length; i += 1) {
          const sampleIndex = sampleOffset + i;
          buffer[i] = Math.sin((2 * Math.PI * testFrequency * sampleIndex) / sampleRate) * 0.8;
        }
        sampleOffset += buffer.length;
      }
    }

    class MockAudioContext {
      sampleRate = sampleRate;
      state: AudioContextState = "running";

      async resume() {
        return undefined;
      }

      async close() {
        return undefined;
      }

      createAnalyser() {
        return new MockAnalyserNode();
      }

      createMediaStreamSource() {
        return {
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: MockAudioContext,
    });
  });

  await gotoApp(page);

  const tuner = page.getByRole("region", { name: /guitar tuner/i });
  await expect(tuner).toBeVisible();
  await expect(tuner.getByText("Tune before you record")).toBeVisible();
  await expect(tuner.getByText(/eadgbe/i)).toBeVisible();

  await tuner.getByRole("button", { name: /start tuner/i }).click();
  await expect(tuner.getByRole("button", { name: /stop tuner/i })).toBeVisible();
  await expect(tuner.getByText(/play one string at a time|hz/i)).toBeVisible();
  const meter = tuner.getByRole("meter", { name: /tuning cents/i });
  await expect(meter).toBeVisible();
  await expect(meter).not.toHaveAttribute("aria-valuenow", "0");
  await expect(tuner.locator(".guitar-tuner__needle")).toHaveAttribute("style", /left:/);

  await tuner.getByRole("button", { name: /stop tuner/i }).click();
  await expect(tuner.getByRole("button", { name: /start tuner/i })).toBeVisible();
});
