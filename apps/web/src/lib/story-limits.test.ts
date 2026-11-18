import { describe, it } from "node:test";
import { expect } from "expect";
import { activeStoryLimit, activeStoryLimitMessage } from "./story-limits";
import { USER_TYPES } from "./user-types";

describe("activeStoryLimit", () => {
  it("gives a paid storyteller and an administrator fifteen, and everyone else three", () => {
    expect(activeStoryLimit(USER_TYPES.paidStoryteller)).toBe(15);
    expect(activeStoryLimit(USER_TYPES.administrator)).toBe(15);
    expect(activeStoryLimit(USER_TYPES.unpaidStoryteller)).toBe(3);
    expect(activeStoryLimit(USER_TYPES.paidPlayer)).toBe(3);
    expect(activeStoryLimit(USER_TYPES.unpaidPlayer)).toBe(3);
  });

  it("says the limit in words", () => {
    expect(activeStoryLimitMessage(3)).toMatch(/^You already have 3 active stories/);
  });
});
