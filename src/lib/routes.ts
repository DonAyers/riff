/** Client-side routes. Every path except HOME_PATH needs a matching rewrite in vercel.json. */
export const HOME_PATH = "/";
export const TUNER_PATH = "/tuner";
export const BUILDER_PATH = "/builder";
export const LOOPER_PATH = "/looper";
export const SETTINGS_PATH = "/settings";

export const DEEP_LINK_PATHS = [TUNER_PATH, BUILDER_PATH, LOOPER_PATH, SETTINGS_PATH] as const;
