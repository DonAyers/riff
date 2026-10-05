import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = join(process.cwd(), "src");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("AudioWorklet module imports", () => {
  // A plain `?url` import copies the TypeScript file verbatim into the production build
  // (as a video/mp2t data URL), so audioWorklet.addModule() fails outside the dev server.
  // `?worker&url` makes Vite bundle and transpile the worklet into its own JS chunk.
  it("loads every worklet through ?worker&url so it is transpiled for production", () => {
    const offenders = listSourceFiles(SRC_DIR).filter((file) =>
      /from\s+["'][^"']*\.worklet(?:\.ts)?\?url["']/.test(readFileSync(file, "utf-8"))
    );

    expect(offenders).toEqual([]);
  });
});
