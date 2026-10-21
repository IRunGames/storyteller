import { describe, it } from "node:test";
import { expect } from "expect";
import { WELCOME_BACKGROUNDS, pickWelcomeBackground } from "./welcome";

describe("pickWelcomeBackground", () => {
  it("can land on every picture, and only on them", () => {
    const n = WELCOME_BACKGROUNDS.length;
    const picks = Array.from({ length: n }, (_, i) => pickWelcomeBackground(() => (i + 0.5) / n));
    expect(picks).toEqual([...WELCOME_BACKGROUNDS]);
    expect(pickWelcomeBackground(() => 0.999999)).toBe(WELCOME_BACKGROUNDS[n - 1]);
  });
});
