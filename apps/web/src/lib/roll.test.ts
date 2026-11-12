import { describe, it } from "node:test";
import { expect } from "expect";

import { isRollNotation, normalizeDice, rollText } from "./roll";

describe("isRollNotation", () => {
  it("wants a dice group and a short text", () => {
    expect(isRollNotation("2d6+1")).toBe(true);
    expect(isRollNotation("1d20")).toBe(true);
    expect(isRollNotation("d%")).toBe(true);
    expect(isRollNotation("12")).toBe(false);
    expect(isRollNotation("")).toBe(false);
    expect(isRollNotation("1d6+" + "1".repeat(100))).toBe(false);
  });
});

describe("normalizeDice", () => {
  it("reads x dice of y sides, counting one when the count is left off", () => {
    expect(normalizeDice("2d6")).toBe("2d6");
    expect(normalizeDice("d8")).toBe("1d8");
    expect(normalizeDice(" 1D20 ")).toBe("1d20");
    expect(normalizeDice("2d6+2")).toBe("2d6+2");
    expect(normalizeDice("d6 - 1")).toBe("1d6-1");
    expect(normalizeDice("2d6+0")).toBe("2d6");
    expect(normalizeDice("0d6")).toBeNull();
    expect(normalizeDice("2d0")).toBeNull();
    expect(normalizeDice("2d6+")).toBeNull();
    expect(normalizeDice("2d6+1d4")).toBeNull();
    expect(normalizeDice("six")).toBeNull();
    expect(normalizeDice("")).toBeNull();
  });
});

describe("rollText", () => {
  it("says the total, then what it was for", () => {
    expect(rollText({ total: 6, label: "for initiative" })).toBe("6 for initiative");
    expect(rollText({ total: 6, label: null })).toBe("6");
  });
});
