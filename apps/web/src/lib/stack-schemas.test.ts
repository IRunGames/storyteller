import { describe, it } from "node:test";
import { expect } from "expect";
import { sceneStacksSchema, stackNameSchema } from "./stack-schemas";

describe("stackNameSchema", () => {
  it("trims a name and keeps its case", () => {
    expect(stackNameSchema.parse("  Docks ")).toBe("Docks");
  });

  it("refuses an empty name and a long one", () => {
    expect(stackNameSchema.safeParse("  ").error?.issues[0].message).toBe("Please name the stack.");
    expect(stackNameSchema.safeParse("x".repeat(41)).success).toBe(false);
  });
});

describe("sceneStacksSchema", () => {
  it("keeps the stacks in order, and allows none", () => {
    expect(sceneStacksSchema.parse({ tags: ["scene", "elements"], saveForStory: false })).toEqual({
      tags: ["scene", "elements"],
      renames: [],
      saveForStory: false,
    });
    expect(sceneStacksSchema.parse({ tags: [], saveForStory: true }).tags).toEqual([]);
  });

  it("refuses two stacks that differ only in case", () => {
    const result = sceneStacksSchema.safeParse({ tags: ["Docks", "docks"], saveForStory: false });
    expect(result.error?.issues[0].message).toBe("Each stack needs its own name.");
  });
});

describe("stack renames", () => {
  it("keeps renames to stacks in the list, and none by default", () => {
    expect(
      sceneStacksSchema.parse({
        tags: ["Docks"],
        renames: [{ from: "scene", to: "Docks" }],
        saveForStory: false,
      }).renames,
    ).toEqual([{ from: "scene", to: "Docks" }]);
    expect(sceneStacksSchema.parse({ tags: [], saveForStory: false }).renames).toEqual([]);
  });

  it("refuses a rename to a stack that is not in the list", () => {
    const result = sceneStacksSchema.safeParse({
      tags: ["Docks"],
      renames: [{ from: "scene", to: "Harbour" }],
      saveForStory: false,
    });
    expect(result.error?.issues[0].message).toBe("A renamed stack must be one of the stacks.");
  });

  it("refuses control characters in a name", () => {
    expect(stackNameSchema.safeParse("Do\u0001cks").success).toBe(false);
  });
});
