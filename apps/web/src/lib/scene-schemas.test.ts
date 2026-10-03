import { describe, it } from "node:test";
import { expect } from "expect";

import { sceneSchema } from "./scene-schemas";

describe("sceneSchema", () => {
  it("trims the title and description, and reads a picked sitting as a number", () => {
    const result = sceneSchema.safeParse({
      title: "  The vault  ",
      description: " Two guards. ",
      idStorySession: "12",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      title: "The vault",
      description: "Two guards.",
      idStorySession: 12,
    });
  });

  it("reads the select's empty option as not played yet", () => {
    const result = sceneSchema.safeParse({
      title: "The vault",
      description: "",
      idStorySession: "",
    });
    expect(result.data?.idStorySession).toBeNull();
  });

  it("refuses a scene with no title", () => {
    const result = sceneSchema.safeParse({ title: "   ", description: "", idStorySession: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Please give the scene a title.");
  });
});
