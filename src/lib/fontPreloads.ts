/**
 * Fonts used on the first screen, preloaded from index.html so they download alongside the
 * CSS instead of after it. Keep in step with src/styles/fonts.css.
 */
export const PRELOADED_FONTS = [
  { pkg: "@fontsource/silkscreen", file: "silkscreen-latin-400-normal" },
  { pkg: "@fontsource/vt323", file: "vt323-latin-400-normal" },
  { pkg: "@fontsource/atkinson-hyperlegible", file: "atkinson-hyperlegible-latin-400-normal" },
  { pkg: "@fontsource/atkinson-hyperlegible", file: "atkinson-hyperlegible-latin-700-normal" },
] as const;

/**
 * The URL each preloaded font is served from. A preload only helps when its URL matches the
 * one in the CSS exactly: in a build that is the hashed asset, in dev the package file.
 */
export function getFontPreloadHrefs(builtAssetFileNames: readonly string[] | null, base = "/"): string[] {
  return PRELOADED_FONTS.map(({ pkg, file }) => {
    if (!builtAssetFileNames) return `${base}node_modules/${pkg}/files/${file}.woff2`;

    const pattern = new RegExp(`(^|/)${file}-[\\w-]+\\.woff2$`);
    const asset = builtAssetFileNames.find((name) => pattern.test(name));
    if (!asset) throw new Error(`Font preload: no built asset for ${file}.woff2`);
    return `${base}${asset}`;
  });
}
