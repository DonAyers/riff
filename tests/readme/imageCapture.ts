import path from "node:path";

export const README_IMAGE_OUTPUT = "image.png";
export const README_IMAGE_VIEWPORT = {
  width: 430,
  height: 931,
} as const;

export const README_IMAGE_STYLES = `
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

export function getReadmeImageOutputPath(rootDir = process.cwd()): string {
  return path.resolve(rootDir, README_IMAGE_OUTPUT);
}
