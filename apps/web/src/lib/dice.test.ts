import { afterEach, describe, it } from "node:test";
import { expect } from "expect";
import { NumberGenerator } from "@dice-roller/rpg-dice-roller";

import { rollDice } from "./dice";

const generator = NumberGenerator.generator;

describe("rollDice", () => {
  // rollDice sets its own engine on every roll, so each test swaps in the
  // library's lowest- or highest-rolling one through the option it takes.
  afterEach(() => {
    generator.engine = NumberGenerator.engines.nativeMath;
  });

  it("rolls xdy+z, keeping each die", () => {
    expect(rollDice("2d4+2", "initiative", NumberGenerator.engines.min)).toEqual({
      ok: true,
      roll: {
        notation: "2d4+2",
        label: "initiative",
        total: 4,
        dice: [
          { value: 1, dropped: false },
          { value: 1, dropped: false },
        ],
        detail: "2d4+2: [1, 1]+2 = 4",
      },
    });
    const max = rollDice("2d4+2", null, NumberGenerator.engines.max);
    expect(max.ok && max.roll.total).toBe(10);
  });

  it("marks a die the notation drops", () => {
    const result = rollDice("4d6kh3", null, NumberGenerator.engines.min);
    expect(result.ok && result.roll.dice.filter((die) => die.dropped)).toHaveLength(1);
    expect(result.ok && result.roll.total).toBe(3);
  });

  it("keeps the dice of every group", () => {
    const result = rollDice("2d6+1d4-1", null, NumberGenerator.engines.min);
    expect(result.ok && result.roll.dice).toHaveLength(3);
    expect(result.ok && result.roll.total).toBe(2);
  });

  it("reads dice written with spaces in them", () => {
    const result = rollDice("(1d6 + 2) * 2", null, NumberGenerator.engines.min);
    expect(result.ok && result.roll.total).toBe(6);
  });

  it("rolls with the crypto engine by default", () => {
    const result = rollDice("3d6", null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.roll.total).toBeGreaterThanOrEqual(3);
    expect(result.roll.total).toBeLessThanOrEqual(18);
    for (const die of result.roll.dice) expect(die.value).toBeGreaterThanOrEqual(1);
  });

  it("refuses a roll too big to make", () => {
    const tooMany = "Keep a roll to 100 dice of up to 1000 sides each.";
    expect(rollDice("101d6", null)).toEqual({ ok: false, error: tooMany });
    expect(rollDice("1d1001", null)).toEqual({ ok: false, error: tooMany });
    expect(rollDice("60d6+60d6", null)).toEqual({ ok: false, error: tooMany });
    expect(rollDice(`1d6${"+1".repeat(60)}`, null)).toEqual({
      ok: false,
      error: "Keep a roll under 100 characters.",
    });
  });

  it("refuses what it cannot read", () => {
    expect(rollDice("banana", null)).toEqual({
      ok: false,
      error: "That is not a roll I can read. Try /roll 2d6+1.",
    });
    expect(rollDice("12", null)).toEqual({
      ok: false,
      error: "That is not a roll I can read. Try /roll 2d6+1.",
    });
  });
});
