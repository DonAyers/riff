import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  README_IMAGE_OUTPUT,
  README_IMAGE_VIEWPORT,
  getReadmeImageOutputPath,
} from "./imageCapture";

describe("imageCapture", () => {
  it("locks the README screenshot to the documented mobile viewport", () => {
    expect(README_IMAGE_VIEWPORT).toEqual({
      width: 430,
      height: 931,
    });
  });

  it("writes the screenshot to the repository root image file", () => {
    expect(getReadmeImageOutputPath("C:\\repo")).toBe(
      path.resolve("C:\\repo", README_IMAGE_OUTPUT)
    );
  });
});
