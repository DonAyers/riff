import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScreenWakeLock } from "./useScreenWakeLock";

type MockWakeLockSentinel = Pick<WakeLockSentinel, "release" | "addEventListener">;

describe("useScreenWakeLock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("requests a screen wake lock when enabled", async () => {
    const request = vi.fn(async () => ({
      release: vi.fn(async () => undefined),
      addEventListener: vi.fn(),
    })) as unknown as (type: "screen") => Promise<WakeLockSentinel>;

    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });

    renderHook(() => useScreenWakeLock());

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("screen");
    });
  });

  it("does not request wake lock when disabled", () => {
    const request = vi.fn();

    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });

    renderHook(() => useScreenWakeLock(false));

    expect(request).not.toHaveBeenCalled();
  });

  it("releases the wake lock on unmount", async () => {
    const release = vi.fn(async () => undefined);
    const sentinel: MockWakeLockSentinel = {
      release,
      addEventListener: vi.fn(),
    };

    const request = vi.fn(async () => sentinel as WakeLockSentinel);
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });

    const { unmount } = renderHook(() => useScreenWakeLock());

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("screen");
    });

    unmount();
    await waitFor(() => {
      expect(release).toHaveBeenCalledTimes(1);
    });
  });
});
