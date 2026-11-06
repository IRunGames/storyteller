import { describe, it } from "node:test";
import { expect } from "expect";

import {
  emptyStatBlock,
  evaluateStatBlock,
  emptyStatRowFields,
  fitStatValue,
  resolveConnection,
  rowKeyText,
  statBlockFromFields,
  tidyStatBlock,
  toStatBlockFields,
  type StatBlock,
  type StatBlockDefinition,
  type StatDefinition,
  type StatRowFieldValues,
} from "./stat-blocks";

const stat = (
  over: Partial<StatDefinition> & Pick<StatDefinition, "name" | "type">,
): StatDefinition => ({
  label: "",
  rack: [],
  connectedTo: "",
  computedAs: "",
  ...over,
});

// A definition with every type and both kinds of connection: a pool fed by
// a display in another group, a stack fed by one in its own, a display fed
// by a computed stat, and a formula reading two groups.
const definition: StatBlockDefinition = {
  groups: [
    {
      name: "stats",
      label: "Stats",
      keyedBy: "",
      stats: [
        stat({ name: "str", type: "display", label: "Strength" }),
        stat({ name: "size", type: "display" }),
        stat({ name: "mod", type: "computed", computedAs: "floor((stats.str.value - 10) / 2)" }),
      ],
    },
    {
      name: "combat",
      label: "",
      keyedBy: "",
      stats: [
        stat({ name: "hp", type: "pool", label: "HP", connectedTo: "stats.str" }),
        stat({ name: "mana", type: "pool" }),
        stat({ name: "rage", type: "stack" }),
        stat({ name: "wounds", type: "stack", connectedTo: "toughness" }),
        stat({ name: "toughness", type: "display" }),
        stat({ name: "die", type: "rack", rack: ["d4", "d6", "d8"] }),
        stat({ name: "level", type: "rack", rack: [1, 2, 3] }),
        stat({ name: "shown_mod", type: "display", connectedTo: "stats.mod" }),
        stat({ name: "reach", type: "computed", computedAs: "combat.hp.max + combat.rage.value" }),
      ],
    },
    // A group that repeats: each row a weapon, with a computed stat reading
    // its own row and a plain group, and a pool fed from its own row.
    {
      name: "attack",
      label: "Attack",
      keyedBy: "weapon",
      stats: [
        stat({ name: "weapon", type: "display", label: "Weapon" }),
        stat({ name: "strike", type: "display", label: "Strike" }),
        stat({
          name: "total",
          type: "computed",
          computedAs: "attack.strike.value + stats.str.value",
        }),
        stat({ name: "uses", type: "pool", connectedTo: "strike" }),
      ],
    },
  ],
};

const block = {
  stats: { str: { value: 14 }, size: { value: "large" } },
  combat: {
    hp: { value: 9, min: 0, max: 99 },
    mana: { value: 3, min: 1, max: 5 },
    rage: { value: 2, max: 3 },
    wounds: { value: 1 },
    toughness: { value: 4 },
    die: { value: "d6" },
    level: { value: "2" },
  },
  attack: [
    { weapon: { value: "Sword" }, strike: { value: 4 }, uses: { value: 2, min: 0 } },
    { weapon: { value: "Fist" }, strike: { value: 1 }, uses: { value: 0, min: 0 } },
  ],
};

const find = (groups: ReturnType<typeof evaluateStatBlock>, group: string, name: string) =>
  groups.find((g) => g.name === group)!.stats.find((s) => s.name === name)!;

describe("evaluateStatBlock", () => {
  const groups = evaluateStatBlock(definition, block);

  it("keeps the definition's order and labels, a group's name standing in for no label", () => {
    expect(groups.map((g) => [g.name, g.label])).toEqual([
      ["stats", "Stats"],
      ["combat", "combat"],
      ["attack", "Attack"],
    ]);
    expect(groups[0].stats.map((s) => s.label)).toEqual(["Strength", "size", "mod"]);
  });

  it("shows a display's value, a number or a word", () => {
    expect(find(groups, "stats", "str").value).toBe(14);
    expect(find(groups, "stats", "size").value).toBe("large");
  });

  it("works a computed stat out from the others", () => {
    expect(find(groups, "stats", "mod").value).toBe(2);
    expect(find(groups, "stats", "mod").stored).toBeNull();
  });

  it("feeds a pool's max from the stat it is connected to, and drops a stored max", () => {
    const hp = find(groups, "combat", "hp");
    expect(hp).toMatchObject({ value: 9, min: 0, max: 14, maxFrom: "Strength" });
    expect(hp.stored).toEqual({ value: 9, min: 0 });
  });

  it("keeps a pool's own min and max when nothing feeds it", () => {
    expect(find(groups, "combat", "mana")).toMatchObject({ value: 3, min: 1, max: 5 });
  });

  it("gives a stack its max, fed from its own group by a bare name, or none", () => {
    expect(find(groups, "combat", "rage")).toMatchObject({ value: 2, max: 3 });
    expect(find(groups, "combat", "wounds")).toMatchObject({
      value: 1,
      max: 4,
      maxFrom: "toughness",
    });
  });

  it("finds a rack's entry whether stored as itself or as its digits", () => {
    expect(find(groups, "combat", "die")).toMatchObject({ value: "d6", rackIndex: 1 });
    expect(find(groups, "combat", "level")).toMatchObject({ value: 2, rackIndex: 1 });
  });

  it("feeds a display from a computed stat", () => {
    expect(find(groups, "combat", "shown_mod")).toMatchObject({ value: 2, valueFrom: "mod" });
  });

  it("lets a formula read a fed max and another group's value", () => {
    expect(find(groups, "combat", "reach").value).toBe(16);
  });

  it("shows nothing for an unset stat, a stack at 0, and a formula that is not a number", () => {
    const empty = evaluateStatBlock(definition, undefined);
    expect(find(empty, "stats", "str").value).toBeNull();
    expect(find(empty, "stats", "mod").value).toBeNull();
    expect(find(empty, "combat", "rage")).toMatchObject({ value: 0, max: null });
    expect(find(empty, "combat", "hp")).toMatchObject({ value: null, min: 0, max: null });
    expect(find(empty, "combat", "die")).toMatchObject({ value: null, rackIndex: -1 });
  });

  it("lets a stored value go when it no longer fits its stat", () => {
    // As stored, so typed loosely: what fits is decided here, not by the type.
    const stale = evaluateStatBlock(definition, {
      stats: { str: { value: "fourteen" }, mod: { value: 99 } },
      combat: {
        hp: { value: "nine" },
        die: { value: "d20" },
        rage: { value: 2, max: "lots" },
        shown_mod: { value: 5 },
      },
    } as unknown as StatBlock);
    expect(find(stale, "stats", "str").value).toBe("fourteen");
    expect(find(stale, "stats", "mod").value).toBeNull();
    expect(find(stale, "combat", "hp")).toMatchObject({ value: null, stored: null });
    expect(find(stale, "combat", "die")).toMatchObject({ value: null, stored: null });
    expect(find(stale, "combat", "rage")).toMatchObject({
      value: 2,
      max: null,
      stored: { value: 2 },
    });
    expect(find(stale, "combat", "shown_mod")).toMatchObject({ value: null, stored: null });
  });

  it("draws a repeating group as rows in order, each worked out on its own", () => {
    const attack = groups.find((g) => g.name === "attack")!;
    expect(attack.keyedBy).toBe("weapon");
    expect(attack.stats).toEqual([]);
    expect(attack.rows.map((row) => row.key)).toEqual(["Sword", "Fist"]);
    const total = (i: number) => attack.rows[i].stats.find((s) => s.name === "total")!.value;
    expect(total(0)).toBe(18);
    expect(total(1)).toBe(15);
    const uses = attack.rows[0].stats.find((s) => s.name === "uses")!;
    expect(uses.max).toBe(4);
    expect(uses.maxFrom).toBe("Strike");
  });

  it("keeps a row whose key is empty or wrong, with a null key, so a form can draw it", () => {
    const rows = evaluateStatBlock(definition, {
      ...block,
      attack: [{ strike: { value: 2 } }, { weapon: { value: "" }, strike: { value: 3 } }],
    }).find((g) => g.name === "attack")!.rows;
    expect(rows.map((row) => row.key)).toEqual([null, null]);
    expect(rows[1].stats.find((s) => s.name === "strike")!.value).toBe(3);
  });

  it("shows no rows for an object under a repeating group, and nothing for an array under a plain one", () => {
    const groups = evaluateStatBlock(definition, {
      ...block,
      attack: { strike: { value: 4 } } as never,
      stats: [{ str: { value: 1 } }] as never,
    });
    expect(groups.find((g) => g.name === "attack")!.rows).toEqual([]);
    expect(find(groups, "stats", "str").value).toBeNull();
  });

  it("survives a definition that feeds a stat from itself", () => {
    const loop: StatBlockDefinition = {
      groups: [
        {
          name: "g",
          label: "",
          keyedBy: "",
          stats: [
            stat({ name: "a", type: "display", connectedTo: "b" }),
            stat({ name: "b", type: "display", connectedTo: "a" }),
          ],
        },
      ],
    };
    const evaluated = evaluateStatBlock(loop, { g: { a: { value: 1 }, b: { value: 2 } } });
    expect(evaluated[0].stats.map((s) => s.value)).toEqual([null, null]);
  });
});

describe("tidyStatBlock", () => {
  it("drops rows with no usable key and keeps the first of two with one key", () => {
    const tidy = tidyStatBlock(definition, {
      ...block,
      attack: [
        { weapon: { value: "Sword" }, strike: { value: 4 } },
        { strike: { value: 9 } },
        { weapon: { value: " Sword " }, strike: { value: 5 } },
        { weapon: { value: "Fist" }, strike: { value: 1 } },
      ],
    });
    expect(tidy.attack).toEqual([
      { weapon: { value: "Sword" }, strike: { value: 4 } },
      { weapon: { value: "Fist" }, strike: { value: 1 } },
    ]);
  });

  it("turns an object under a repeating group into no rows, and drops an array under a plain one", () => {
    const tidy = tidyStatBlock(definition, {
      attack: { strike: { value: 4 } } as never,
      stats: [{ str: { value: 1 } }] as never,
    });
    expect(tidy.attack).toEqual([]);
    expect(tidy.stats).toBeUndefined();
  });
});

describe("rowKeyText", () => {
  it("reads a number or a word as text, and nothing for the rest", () => {
    expect(rowKeyText(6)).toBe("6");
    expect(rowKeyText(" Sword ")).toBe("Sword");
    expect(rowKeyText("")).toBeNull();
    expect(rowKeyText("   ")).toBeNull();
    expect(rowKeyText(null)).toBeNull();
    expect(rowKeyText(NaN)).toBeNull();
  });
});

describe("fitStatValue", () => {
  it("takes a number or a short word for a display, and nothing for a fed one", () => {
    const display = stat({ name: "d", type: "display" });
    expect(fitStatValue(display, false, { value: 3 })).toEqual({ value: 3 });
    expect(fitStatValue(display, false, { value: "big" })).toEqual({ value: "big" });
    expect(fitStatValue(display, false, { value: "x".repeat(201) })).toBeNull();
    expect(fitStatValue(display, false, { value: Infinity })).toBeNull();
    expect(fitStatValue(display, true, { value: 3 })).toBeNull();
    expect(fitStatValue(display, false, 3)).toBeNull();
  });

  it("gives a pool a min of 0 when none is stored and keeps its max only when not fed", () => {
    const pool = stat({ name: "p", type: "pool" });
    expect(fitStatValue(pool, false, { value: 2, max: 5 })).toEqual({ value: 2, min: 0, max: 5 });
    expect(fitStatValue(pool, true, { value: 2, min: 1, max: 5 })).toEqual({ value: 2, min: 1 });
  });
});

describe("resolveConnection", () => {
  it("reads a bare name in the same group and a dotted one in another", () => {
    expect(resolveConnection(definition, "combat", "toughness")).toEqual({
      group: "combat",
      stat: "toughness",
    });
    expect(resolveConnection(definition, "combat", "stats.str")).toEqual({
      group: "stats",
      stat: "str",
    });
    expect(resolveConnection(definition, "combat", "")).toBeNull();
    expect(resolveConnection(definition, "combat", "str")).toBeNull();
    expect(resolveConnection(definition, "combat", "a.b.c")).toBeNull();
  });
});

describe("emptyStatBlock", () => {
  it("starts every stored stat at its bottom and stores nothing for the rest", () => {
    expect(emptyStatBlock(definition)).toEqual({
      stats: { str: { value: 0 }, size: { value: 0 } },
      combat: {
        hp: { value: 0, min: 0 },
        mana: { value: 0, min: 0, max: 0 },
        rage: { value: 0 },
        wounds: { value: 0 },
        toughness: { value: 0 },
        die: { value: "d4" },
        level: { value: 1 },
      },
      attack: [],
    });
  });
});

describe("toStatBlockFields and statBlockFromFields", () => {
  it("lays a block out as text and reads it back, leaving what is not a number yet out", () => {
    const small: StatBlockDefinition = {
      groups: [
        {
          name: "combat",
          label: "",
          keyedBy: "",
          stats: [
            stat({ name: "hp", type: "pool" }),
            stat({ name: "rage", type: "stack" }),
            stat({ name: "die", type: "rack", rack: ["d4", "d6"] }),
          ],
        },
      ],
    };
    const fields = toStatBlockFields(small, {
      combat: { hp: { value: 3, min: 1, max: 9 }, rage: { value: 2 }, die: { value: "d6" } },
    });
    expect(fields).toEqual({
      combat: {
        hp: { value: "3", min: "1", max: "9" },
        rage: { value: "2", min: "", max: "" },
        die: { value: "d6", min: "", max: "" },
      },
    });
    expect((toStatBlockFields(small, undefined).combat as StatRowFieldValues).hp).toEqual({
      value: "",
      min: "",
      max: "",
    });
    expect(
      statBlockFromFields({
        combat: {
          hp: { value: " 3 ", min: "1", max: "" },
          rage: { value: "", min: "", max: "" },
          die: { value: "d6", min: "", max: "x" },
        },
      }),
    ).toEqual({ combat: { hp: { value: 3, min: 1 }, die: { value: "d6" } } });
  });

  it("lays a repeating group out as an array of row fields and reads it back", () => {
    const fields = toStatBlockFields(definition, block);
    expect(fields.attack).toEqual([
      {
        weapon: { value: "Sword", min: "", max: "" },
        strike: { value: "4", min: "", max: "" },
        total: { value: "", min: "", max: "" },
        uses: { value: "2", min: "0", max: "" },
      },
      {
        weapon: { value: "Fist", min: "", max: "" },
        strike: { value: "1", min: "", max: "" },
        total: { value: "", min: "", max: "" },
        uses: { value: "0", min: "0", max: "" },
      },
    ]);
    // A row with no usable key is tidied away before the form starts.
    expect(
      toStatBlockFields(definition, { ...block, attack: [{ strike: { value: 9 } }] }).attack,
    ).toEqual([]);
    expect(statBlockFromFields(fields).attack).toEqual([
      { weapon: { value: "Sword" }, strike: { value: 4 }, uses: { value: 2, min: 0 } },
      { weapon: { value: "Fist" }, strike: { value: 1 }, uses: { value: 0, min: 0 } },
    ]);
  });

  it("starts a new row with every field empty but a rack on its first entry", () => {
    const group = {
      name: "g",
      label: "",
      keyedBy: "name",
      stats: [
        stat({ name: "name", type: "display" }),
        stat({ name: "hp", type: "pool" }),
        stat({ name: "die", type: "rack", rack: ["d4", "d6"] }),
        stat({ name: "mod", type: "computed", computedAs: "g.hp.value" }),
      ],
    };
    expect(emptyStatRowFields(group)).toEqual({
      name: { value: "", min: "", max: "" },
      hp: { value: "", min: "", max: "" },
      die: { value: "d4", min: "", max: "" },
      mod: { value: "", min: "", max: "" },
    });
  });
});
