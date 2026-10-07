import { describe, it } from "node:test";
import { expect } from "expect";
import {
  formatWaited,
  formatWaitingCount,
  isUnplayable,
  newSessionTitle,
  pickWaitingBackground,
  WAITING_BACKGROUNDS,
} from "./play";

describe("formatWaited", () => {
  it("reads as a clock", () => {
    expect(formatWaited(7)).toBe("0:07");
    expect(formatWaited(760.9)).toBe("12:40");
    expect(formatWaited(3725)).toBe("1:02:05");
  });

  it("reads a clock running behind the database's as no wait", () => {
    expect(formatWaited(-3)).toBe("0:00");
  });
});

describe("formatWaitingCount", () => {
  it("counts people", () => {
    expect(formatWaitingCount(1)).toBe("1 person waiting");
    expect(formatWaitingCount(4)).toBe("4 people waiting");
  });
});

describe("isUnplayable", () => {
  it("refuses a story that is inactive, archived or both", () => {
    expect(isUnplayable({ isActive: true, isArchived: false })).toBe(false);
    expect(isUnplayable({ isActive: false, isArchived: false })).toBe(true);
    expect(isUnplayable({ isActive: true, isArchived: true })).toBe(true);
  });
});

describe("newSessionTitle", () => {
  it("is the day plus \" session\"", () => {
    expect(newSessionTitle("Oct 6, 2026")).toBe("Oct 6, 2026 session");
  });
});

describe("pickWaitingBackground", () => {
  it("can land on every picture, and only on them", () => {
    const n = WAITING_BACKGROUNDS.length;
    const picks = Array.from({ length: n }, (_, i) => pickWaitingBackground(() => (i + 0.5) / n));
    expect(picks).toEqual([...WAITING_BACKGROUNDS]);
    // The top of Math.random's range is just under 1, still the last picture.
    expect(pickWaitingBackground(() => 0.999999)).toBe(WAITING_BACKGROUNDS[n - 1]);
  });
});
