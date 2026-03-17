type StorageManagerLike = {
  persisted?: () => Promise<boolean>;
};

type NavigatorLike = {
  userAgent?: string;
  vendor?: string;
  platform?: string;
  maxTouchPoints?: number;
  storage?: StorageManagerLike;
};

export interface StorageEvictionRiskSignals {
  userAgent: string;
  vendor: string;
  platform: string;
  maxTouchPoints: number;
  persistentStorageGranted: boolean | null;
}

function isAppleMobileBrowser({
  userAgent,
  vendor,
  platform,
  maxTouchPoints,
}: Omit<StorageEvictionRiskSignals, "persistentStorageGranted">): boolean {
  const normalizedUserAgent = userAgent.toLowerCase();
  const normalizedPlatform = platform.toLowerCase();
  const isAppleVendor = vendor.includes("Apple");
  const isTouchMac = normalizedPlatform === "macintel" && maxTouchPoints > 1;
  const isIosDevice = /iphone|ipad|ipod/.test(normalizedUserAgent)
    || /iphone|ipad|ipod/.test(normalizedPlatform)
    || isTouchMac;

  return isAppleVendor && isIosDevice;
}

async function getPersistentStorageState(storage?: StorageManagerLike): Promise<boolean | null> {
  if (typeof storage?.persisted !== "function") {
    return null;
  }

  try {
    return await storage.persisted();
  } catch {
    return null;
  }
}

export function isStorageEvictionRiskLikely(signals: StorageEvictionRiskSignals): boolean {
  if (signals.persistentStorageGranted === true) {
    return false;
  }

  return isAppleMobileBrowser(signals);
}

function readNavigatorSignals(target: NavigatorLike): Omit<StorageEvictionRiskSignals, "persistentStorageGranted"> {
  return {
    userAgent: target.userAgent ?? "",
    vendor: target.vendor ?? "",
    platform: target.platform ?? "",
    maxTouchPoints: target.maxTouchPoints ?? 0,
  };
}

export async function detectStorageEvictionRisk(target?: NavigatorLike): Promise<boolean> {
  if (!target) {
    if (typeof navigator === "undefined") {
      return false;
    }

    return detectStorageEvictionRisk(navigator);
  }

  const persistentStorageGranted = await getPersistentStorageState(target.storage);

  return isStorageEvictionRiskLikely({
    ...readNavigatorSignals(target),
    persistentStorageGranted,
  });
}
