import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEEP_LINK_PATHS } from "./routes";

interface Rewrite {
  source: string;
  destination: string;
}

const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
  rewrites: Rewrite[];
};

describe("vercel.json rewrites", () => {
  it.each(DEEP_LINK_PATHS)("serves the app shell when %s is opened directly", (path) => {
    const rewrites = vercelConfig.rewrites.filter((rewrite) => rewrite.destination === "/");
    expect(rewrites.map((rewrite) => rewrite.source)).toEqual(
      expect.arrayContaining([path, `${path}/:path*`])
    );
  });
});
