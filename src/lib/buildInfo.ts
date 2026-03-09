const fallbackVersion = "0.0.0-dev";
const fallbackBuildId = "local";

export const appVersion =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : fallbackVersion;

export const appBuildId =
  typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : fallbackBuildId;

export const buildLabel = `v${appVersion} · ${appBuildId}`;