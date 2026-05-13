import { useEffect } from "react";

interface WakeLockNavigator extends Navigator {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
}

export function useScreenWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      return;
    }

    const wakeLockApi = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLockApi) {
      return;
    }

    let isDisposed = false;
    let lock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      if (isDisposed || document.visibilityState !== "visible") {
        return;
      }

      try {
        lock = await wakeLockApi.request("screen");
        lock.addEventListener("release", () => {
          lock = null;
        });
      } catch {
        lock = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && lock === null) {
        void requestWakeLock();
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (lock) {
        void lock.release();
        lock = null;
      }
    };
  }, [enabled]);
}
