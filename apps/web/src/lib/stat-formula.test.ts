import { describe, it } from "node:test";
import { expect } from "expect";

import {
  evaluateFormula,
  formulaReferences,
  parseFormula,
  type FormulaLookup,
  type FormulaNode,
} from "./stat-formula";

// A block for the lookups: stats.str 14, stats.dex 9, combat.hp 7 of 20
// (min 0), and a display holding a word.
const values: Record<string, Record<string, Partial<Record<string, number | string>>>> = {
  stats: { str: { value: 14 }, dex: { value: 9 }, size: { value: "large" } },
  combat: { hp: { value: 7, min: 0, max: 20 } },
};
const lookup: FormulaLookup = ({ group, stat, part }) => values[group]?.[stat]?.[part];

function tree(text: string): FormulaNode {
  const parsed = parseFormula(text);
  if (!parsed.ok) throw new Error(`${text}: ${parsed.message} at ${parsed.position}`);
  return parsed.tree;
}

function run(text: string): number {
  return evaluateFormula(tree(text), lookup);
}

describe("parseFormula and evaluateFormula", () => {
  it("does arithmetic in the usual order, with parentheses and unary minus", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) * 3")).toBe(9);
    expect(run("10 - 4 - 3")).toBe(3);
    expect(run("12 / 4 / 3")).toBe(1);
    expect(run("-2 * -3")).toBe(6);
    expect(run("-(1 + 1)")).toBe(-2);
    expect(run("2.5 * 2")).toBe(5);
  });

  it("reads a stat's value with or without the part spelled out", () => {
    expect(run("stats.str")).toBe(14);
    expect(run("stats.str.value")).toBe(14);
    expect(run("combat.hp.max - combat.hp.value")).toBe(13);
    expect(run("combat.hp.min")).toBe(0);
  });

  it("works a D&D modifier out", () => {
    expect(run("floor((stats.str.value - 10) / 2)")).toBe(2);
    expect(run("floor((stats.dex.value - 10) / 2)")).toBe(-1);
  });

  it("offers the rounding functions, min, max and abs", () => {
    expect(run("ceil(7 / 2)")).toBe(4);
    expect(run("round(7 / 2)")).toBe(4);
    expect(run("abs(stats.dex - stats.str)")).toBe(5);
    expect(run("min(stats.str, stats.dex, 3)")).toBe(3);
    expect(run("max(stats.str, stats.dex)")).toBe(14);
  });

  it("answers a comparison with 1 or 0, and if() takes the branch it says", () => {
    expect(run("stats.str > 10")).toBe(1);
    expect(run("stats.str < 10")).toBe(0);
    expect(run("stats.str >= 14")).toBe(1);
    expect(run("stats.str <= 13")).toBe(0);
    expect(run("stats.str == 14")).toBe(1);
    expect(run("stats.str != 14")).toBe(0);
    // Current AR: two lower while SDC is under half.
    const ar = "if(combat.hp.value < combat.hp.max / 2, stats.str - 2, stats.str)";
    expect(run(ar)).toBe(12);
    values.combat.hp.value = 15;
    expect(run(ar)).toBe(14);
    values.combat.hp.value = 7;
  });

  it("if() leaves the branch it does not take alone", () => {
    expect(run("if(1, 5, stats.size)")).toBe(5);
    expect(run("if(0, stats.size, 5)")).toBe(5);
  });

  it("is NaN for a word, a missing stat, a missing part or a division by zero", () => {
    expect(run("stats.size + 1")).toBeNaN();
    expect(run("stats.nothing")).toBeNaN();
    expect(run("stats.str.max")).toBeNaN();
    expect(run("1 / 0")).toBeNaN();
    expect(run("if(stats.size, 1, 2)")).toBeNaN();
  });

  it("lists every reference a formula reads, in order", () => {
    expect(formulaReferences(tree("max(stats.str, combat.hp.max) + stats.str.value"))).toEqual([
      { group: "stats", stat: "str", part: "value" },
      { group: "combat", stat: "hp", part: "max" },
      { group: "stats", stat: "str", part: "value" },
    ]);
    expect(formulaReferences(tree("1 + 2"))).toEqual([]);
  });

  it("refuses what it cannot read, and says where", () => {
    const refusals: [string, string, number][] = [
      ["1 +", "The formula ends too soon.", 3],
      ["(1 + 2", "Expected a closing parenthesis.", 6],
      ["1 + 2)", 'Unexpected ")".', 5],
      ["str + 1", '"str" needs a group and a stat, as in stats.str or stats.str.value.', 0],
      ["stats.str.count", "A stat's part is one of value, min, max.", 10],
      ["stats.", 'Expected a stat name after "stats.".', 6],
      ["sqrt(4)", '"sqrt" is not a function. Use floor, ceil, round, abs, min, max, if.', 0],
      ["floor(1, 2)", "floor() takes 1 argument.", 0],
      ["if(1, 2)", "if() takes 3 arguments.", 0],
      ["1 $ 2", 'Unexpected "$".', 2],
      ["Stats.str", '"Stats" is not a name: lower-case letters, digits and underscores only.', 0],
      ["1 < 2 < 3", 'Unexpected "<".', 6],
    ];
    for (const [text, message, position] of refusals) {
      expect(parseFormula(text)).toEqual({ ok: false, message, position });
    }
  });

  it("refuses an empty formula", () => {
    expect(parseFormula("")).toEqual({
      ok: false,
      message: "The formula ends too soon.",
      position: 0,
    });
    expect(parseFormula("   ").ok).toBe(false);
  });
});
