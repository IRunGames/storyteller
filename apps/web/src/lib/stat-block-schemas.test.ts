import { describe, it } from "node:test";
import { expect } from "expect";

import {
  joinRack,
  readStatBlockDefinition,
  readStatBlocks,
  splitRack,
  statBlockDefinitionFormSchema,
  statBlockDefinitionSchema,
  statBlockSchema,
  statBlocksSchema,
} from "./stat-block-schemas";
import {
  MULTIPLE,
  type StatBlock,
  type StatBlockDefinition,
  type StatDefinition,
  type StatRow,
} from "./stat-blocks";

const stat = (
  over: Partial<StatDefinition> & Pick<StatDefinition, "name" | "type">,
): StatDefinition => ({
  label: "",
  rack: [],
  computedAs: "",
  visible: true,
  format: "",
  description: "",
  sticky: false,
  static: false,
  roll: "",
  global: false,
  upDown: true,
  initialRoll: "",
  ...over,
});

const definition: StatBlockDefinition = {
  groups: [
    {
      name: "stats",
      label: "Stats",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [
        stat({ name: "str", type: "display" }),
        stat({
          name: "mod",
          type: "computed",
          computedAs: "floor((stats.str - 10) / 2)",
          visible: true,
          format: "",
          description: "",
          sticky: false,
          static: false,
          roll: "",
          global: false,
          upDown: true,
          initialRoll: "",
        }),
      ],
    },
    {
      name: "combat",
      label: "Combat",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [
        stat({ name: "hp", type: "pool" }),
        stat({ name: "mana", type: "pool" }),
        stat({ name: "rage", type: "stack" }),
        stat({ name: "die", type: "rack", rack: ["d4", "d6", 8] }),
      ],
    },
    // A group that repeats by its weapon, with a pool of its own on each row.
    {
      name: "attack",
      label: "Attack",
      keyedBy: "weapon",
      rollAll: false,
      canHaveMultiples: false,
      stats: [
        stat({ name: "weapon", type: "display", label: "Weapon" }),
        stat({ name: "strike", type: "display" }),
        stat({ name: "die", type: "rack", rack: ["d4", "d6"] }),
        stat({ name: "sides", type: "rack", rack: [4, 6] }),
        stat({ name: "uses", type: "pool" }),
      ],
    },
  ],
};

/** The definition with one group keyed by another of its stats. */
const withKey = (base: StatBlockDefinition, group: string, keyedBy: string) => ({
  groups: base.groups.map((g) => (g.name === group ? { ...g, keyedBy } : g)),
});

/** The definition with one more stat on a group. */
const withStat = (base: StatBlockDefinition, group: string, added: StatDefinition) => ({
  groups: base.groups.map((g) => (g.name === group ? { ...g, stats: [...g.stats, added] } : g)),
});

/** The messages of a refusal keyed by path, as an action would hand them to a form. */
function errorsOf(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  const errors: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) errors[issue.path.join(".")] ??= issue.message;
  return errors;
}

describe("statBlockDefinitionSchema", () => {
  it("accepts a sound definition as it is", () => {
    const parsed = statBlockDefinitionSchema.safeParse(definition);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(definition);
  });

  it("accepts a group with no stats yet, and no groups at all", () => {
    expect(statBlockDefinitionSchema.safeParse({ groups: [] }).success).toBe(true);
    expect(
      statBlockDefinitionSchema.safeParse({
        groups: [
          {
            name: "saves",
            label: "Saves",
            keyedBy: "",
            rollAll: false,
            canHaveMultiples: false,
            stats: [],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("holds names to identifiers, unique in their group, on the field that breaks it", () => {
    const errors = errorsOf(
      statBlockDefinitionSchema.safeParse({
        groups: [
          {
            name: "Stats",
            label: "",
            keyedBy: "",
            rollAll: false,
            canHaveMultiples: false,
            stats: [],
          },
          {
            name: "a",
            label: "",
            keyedBy: "",
            rollAll: false,
            canHaveMultiples: false,
            stats: [stat({ name: "x", type: "display" }), stat({ name: "x", type: "display" })],
          },
          { name: "a", label: "", keyedBy: "", rollAll: false, canHaveMultiples: false, stats: [] },
        ],
      }),
    );
    expect(errors["groups.0.name"]).toMatch(/lower-case/);
    expect(errors["groups.1.stats.1.name"]).toBe("Another stat in this group has this name.");
    expect(errors["groups.2.name"]).toBe("Another group has this name.");
  });

  it("pairs each type with its fields", () => {
    const errors = errorsOf(
      statBlockDefinitionSchema.safeParse({
        groups: [
          {
            name: "g",
            label: "",
            keyedBy: "",
            rollAll: false,
            canHaveMultiples: false,
            stats: [
              stat({ name: "a", type: "rack" }),
              stat({ name: "b", type: "display", rack: ["d4"] }),
              stat({ name: "c", type: "computed" }),
              stat({
                name: "d",
                type: "display",
                computedAs: "1 + 1",
                visible: true,
                format: "",
                description: "",
                sticky: false,
                static: false,
                roll: "",
                global: false,
                upDown: true,
                initialRoll: "",
              }),
              stat({ name: "e", type: "rack", rack: ["d4"] }),
              stat({
                name: "f",
                type: "computed",
                computedAs: "1 +",
                visible: true,
                format: "",
                description: "",
                sticky: false,
                static: false,
                roll: "",
                global: false,
                upDown: true,
                initialRoll: "",
              }),
            ],
          },
        ],
      }),
    );
    expect(errors["groups.0.stats.0.rack"]).toBe("A rack needs at least one entry.");
    expect(errors["groups.0.stats.1.rack"]).toBe("Only a rack has entries.");
    expect(errors["groups.0.stats.2.computedAs"]).toBe("A computed stat needs a formula.");
    expect(errors["groups.0.stats.3.computedAs"]).toBe("Only a computed stat has a formula.");
    expect(errors["groups.0.stats.5.computedAs"]).toBe(
      "The formula ends too soon. (at character 4)",
    );
  });

  it("lets a pool, a stack or a number display be initialized by a roll it can read", () => {
    const errors = errorsOf(
      statBlockDefinitionSchema.safeParse({
        groups: [
          {
            name: "g",
            label: "",
            keyedBy: "",
            rollAll: false,
            canHaveMultiples: false,
            stats: [
              stat({ name: "a", type: "pool", format: "number", initialRoll: "2d6" }),
              stat({ name: "b", type: "rack", rack: ["d4"], initialRoll: "2d6" }),
              stat({ name: "c", type: "display", format: "", initialRoll: "2d6" }),
              stat({ name: "d", type: "stack", format: "number", initialRoll: "twelve" }),
              stat({ name: "e", type: "display", format: "number", initialRoll: "8d8+3" }),
            ],
          },
        ],
      }),
    );
    expect(errors["groups.0.stats.0.initialRoll"]).toBeUndefined();
    expect(errors["groups.0.stats.1.initialRoll"]).toBe(
      "Only a pool, a stack or a display held to a number is initialized by a roll.",
    );
    expect(errors["groups.0.stats.2.initialRoll"]).toBe(
      "Only a pool, a stack or a display held to a number is initialized by a roll.",
    );
    expect(errors["groups.0.stats.3.initialRoll"]).toBe(
      "That is not a roll I can read. Try 2d6+1.",
    );
    expect(errors["groups.0.stats.4.initialRoll"]).toBeUndefined();
  });

  it("lets only a group that repeats roll all or have multiples", () => {
    const errors = errorsOf(
      statBlockDefinitionSchema.safeParse({
        groups: [
          {
            name: "g",
            label: "",
            keyedBy: "",
            rollAll: true,
            canHaveMultiples: false,
            stats: [stat({ name: "a", type: "display" })],
          },
        ],
      }),
    );
    expect(errors["groups.0.rollAll"]).toBe("Only a group that repeats can roll all.");
    expect(
      errorsOf(
        statBlockDefinitionSchema.safeParse({
          groups: [
            {
              name: "g",
              label: "",
              keyedBy: "",
              rollAll: false,
              canHaveMultiples: true,
              stats: [stat({ name: "a", type: "display" })],
            },
          ],
        }),
      )["groups.0.canHaveMultiples"],
    ).toBe("Only a group that repeats can have multiples.");
    const repeating = statBlockDefinitionSchema.safeParse(
      withKey(
        {
          groups: [
            {
              name: "g",
              label: "",
              keyedBy: "",
              rollAll: true,
              canHaveMultiples: false,
              stats: [stat({ name: "a", type: "display" })],
            },
          ],
        },
        "g",
        "a",
      ),
    );
    expect(repeating.success).toBe(true);
  });

  it("wants every reference to point at a stat that is there", () => {
    const errors = errorsOf(
      statBlockDefinitionSchema.safeParse({
        groups: [
          {
            name: "g",
            label: "",
            keyedBy: "",
            rollAll: false,
            canHaveMultiples: false,
            stats: [
              stat({ name: "a", type: "display" }),
              stat({ name: "b", type: "display" }),
              stat({
                name: "c",
                type: "computed",
                computedAs: "g.nothing + 1",
                visible: true,
                format: "",
                description: "",
                sticky: false,
                static: false,
                roll: "",
                global: false,
                upDown: true,
                initialRoll: "",
              }),
              stat({
                name: "d",
                type: "computed",
                computedAs: "g.a.max",
                visible: true,
                format: "",
                description: "",
                sticky: false,
                static: false,
                roll: "",
                global: false,
                upDown: true,
                initialRoll: "",
              }),
              stat({ name: "e", type: "pool" }),
              stat({
                name: "f",
                type: "computed",
                computedAs: "g.e.max + g.e.min",
                visible: true,
                format: "",
                description: "",
                sticky: false,
                static: false,
                roll: "",
                global: false,
                upDown: true,
                initialRoll: "",
              }),
            ],
          },
        ],
      }),
    );
    expect(errors["groups.0.stats.2.computedAs"]).toBe("There is no stat g.nothing.");
    expect(errors["groups.0.stats.3.computedAs"]).toBe(
      "g.a has no max; only a pool or a stack has one.",
    );
    expect(errors["groups.0.stats.5.computedAs"]).toBeUndefined();
  });

  it("refuses a stat that ends up depending on itself", () => {
    const errors = errorsOf(
      statBlockDefinitionSchema.safeParse({
        groups: [
          {
            name: "g",
            label: "",
            keyedBy: "",
            rollAll: false,
            canHaveMultiples: false,
            stats: [
              stat({
                name: "a",
                type: "computed",
                computedAs: "g.b + 1",
                visible: true,
                format: "",
                description: "",
                sticky: false,
                static: false,
                roll: "",
                global: false,
                upDown: true,
                initialRoll: "",
              }),
              stat({ name: "b", type: "computed", computedAs: "g.c.value" }),
              stat({ name: "c", type: "computed", computedAs: "g.a.value" }),
              stat({ name: "d", type: "computed", computedAs: "g.a.value" }),
            ],
          },
        ],
      }),
    );
    expect(errors["groups.0.stats.0.computedAs"]).toBe("This stat ends up depending on itself.");
    expect(errors["groups.0.stats.1.computedAs"]).toBe("This stat ends up depending on itself.");
    expect(errors["groups.0.stats.2.computedAs"]).toBe("This stat ends up depending on itself.");
    expect(errors["groups.0.stats.3.computedAs"]).toBeUndefined();
  });

  it("lets a group repeat by one of its displays or racks", () => {
    expect(statBlockDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(statBlockDefinitionSchema.safeParse(withKey(definition, "attack", "die")).success).toBe(
      true,
    );
  });

  it("refuses a key that is not there, or is a pool, stack or computed stat", () => {
    expect(
      errorsOf(statBlockDefinitionSchema.safeParse(withKey(definition, "attack", "nope"))),
    ).toEqual({ "groups.2.keyedBy": "There is no stat nope in this group." });
    expect(
      errorsOf(statBlockDefinitionSchema.safeParse(withKey(definition, "combat", "mana"))),
    ).toEqual({
      "groups.1.keyedBy":
        "A key is a display or a rack; a pool, stack or computed stat cannot tell rows apart.",
    });
  });

  it("refuses a reference into a repeating group from outside it", () => {
    const outside = withStat(
      definition,
      "stats",
      stat({
        name: "best",
        type: "computed",
        computedAs: "attack.strike.value",
        visible: true,
        format: "",
        description: "",
        sticky: false,
        static: false,
        roll: "",
        global: false,
        upDown: true,
        initialRoll: "",
      }),
    );
    expect(errorsOf(statBlockDefinitionSchema.safeParse(outside))).toEqual({
      "groups.0.stats.2.computedAs":
        "attack repeats; only a stat in attack can read attack.strike.",
    });
  });

  it("lets a stat in a repeating group read its own row and any plain group", () => {
    const inside = withStat(
      definition,
      "attack",
      stat({
        name: "total",
        type: "computed",
        computedAs: "attack.strike.value + stats.str.value",
        visible: true,
        format: "",
        description: "",
        sticky: false,
        static: false,
        roll: "",
        global: false,
        upDown: true,
        initialRoll: "",
      }),
    );
    expect(statBlockDefinitionSchema.safeParse(inside).success).toBe(true);
  });

  it("reads a stored group with no keyedBy as plain", () => {
    const stored = { groups: [{ name: "stats", label: "", stats: [] }] };
    expect(readStatBlockDefinition(stored)).toEqual({
      groups: [
        {
          name: "stats",
          label: "",
          keyedBy: "",
          rollAll: false,
          canHaveMultiples: false,
          stats: [],
        },
      ],
    });
  });

  it("reads a stored stat without the flags as shown, in its type's format, and not sticky", () => {
    const str = {
      name: "str",
      label: "",
      type: "display",
      rack: [],
      computedAs: "",
    };
    const hp = { ...str, name: "hp", type: "pool" };
    // Each stored without roll, so both read as rolling nothing.
    const stored = {
      groups: [
        {
          name: "stats",
          label: "",
          keyedBy: "",
          rollAll: false,
          canHaveMultiples: false,
          stats: [str, hp],
        },
      ],
    };
    expect(readStatBlockDefinition(stored)).toEqual({
      groups: [
        {
          name: "stats",
          label: "",
          keyedBy: "",
          rollAll: false,
          canHaveMultiples: false,
          stats: [
            {
              ...str,
              visible: true,
              format: "",
              description: "",
              sticky: false,
              static: false,
              roll: "",
              global: false,
              upDown: false,
              initialRoll: "",
            },
            {
              ...hp,
              visible: true,
              format: "number",
              description: "",
              sticky: false,
              static: false,
              roll: "",
              global: false,
              upDown: false,
              initialRoll: "",
            },
          ],
        },
      ],
    });
  });

  it("reads a column back, and the empty definition for anything else", () => {
    expect(readStatBlockDefinition(definition)).toEqual(definition);
    expect(readStatBlockDefinition(null)).toEqual({ groups: [] });
    expect(readStatBlockDefinition({ groups: [{ name: "X" }] })).toEqual({ groups: [] });
  });
});

describe("statBlockDefinitionFormSchema", () => {
  it("splits each rack's text, keeping a number a number, and runs the same rules", () => {
    const parsed = statBlockDefinitionFormSchema.safeParse({
      groups: [
        {
          name: "g",
          label: "",
          keyedBy: "",
          rollAll: false,
          canHaveMultiples: false,
          stats: [
            stat({
              name: "die",
              type: "rack",
              rack: " d4, d6 ,8,, " as unknown as never,
            }),
            stat({
              name: "x",
              type: "computed",
              computedAs: "g.nothing + 1",
              rack: "" as unknown as never,
            }),
          ],
        },
      ],
    });
    expect(parsed.success).toBe(false);
    expect(errorsOf(parsed)).toEqual({
      "groups.0.stats.1.computedAs": "There is no stat g.nothing.",
    });
    expect(splitRack(" d4, d6 ,8,, ")).toEqual(["d4", "d6", 8]);
    expect(joinRack(["d4", "d6", 8])).toBe("d4, d6, 8");
  });
});

describe("statBlockSchema", () => {
  const schema = statBlockSchema(definition);

  it("takes the numbers as inputs post them, and drops what the stats do not hold", () => {
    const parsed = schema.safeParse({
      stats: { str: { value: "14" }, mod: { value: 99 } },
      combat: {
        hp: { value: "9", min: "", max: "50" },
        mana: { value: 3, min: 1, max: 5 },
        rage: { value: "2", max: "" },
        die: { value: "8" },
      },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      stats: { str: { value: 14 }, mod: {} },
      combat: {
        hp: { value: 9, min: 0, max: 50 },
        mana: { value: 3, min: 1, max: 5 },
        rage: { value: 2 },
        die: { value: 8 },
      },
    });
  });

  it("takes a block with only the groups the element picked", () => {
    const parsed = schema.safeParse({
      combat: {
        hp: { value: 1, min: 0, max: 2 },
        mana: { value: 0, min: 0, max: 0 },
        rage: { value: 0 },
        die: { value: 8 },
      },
    });
    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.data ?? {})).toEqual(["combat"]);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("keeps a word for a display", () => {
    const parsed = schema.safeParse({
      stats: { str: { value: "mighty" } },
      combat: {
        hp: { value: 0 },
        mana: { value: 0, max: 0 },
        rage: { value: 0 },
        die: { value: "d4" },
      },
    });
    expect(parsed.success).toBe(true);
    expect((parsed.data as StatBlock).stats).toEqual({ str: { value: "mighty" } });
  });

  it("takes a roll on a pool or a stack only, and only one the roller could read", () => {
    const rolled = (over: Partial<StatDefinition>): StatBlockDefinition => ({
      groups: [
        {
          name: "g",
          label: "",
          keyedBy: "",
          rollAll: false,
          canHaveMultiples: false,
          stats: [
            stat({ name: "hp", type: "pool", roll: "2d6+1" }),
            stat({ name: "x", type: "display", ...over }),
          ],
        },
      ],
    });
    expect(statBlockDefinitionSchema.safeParse(rolled({})).success).toBe(true);
    // A display rolls once it is held to a number, and not before.
    expect(
      statBlockDefinitionSchema.safeParse(rolled({ roll: "1d6", format: "number +/-" })).success,
    ).toBe(true);
    const onDisplay = statBlockDefinitionSchema.safeParse(rolled({ roll: "1d6" }));
    expect(onDisplay.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["groups.0.stats.1.roll", "Only a pool, a stack or a display held to a number has a roll."],
    ]);
    const unreadable = statBlockDefinitionSchema.safeParse(
      rolled({ type: "stack", roll: "twelve" }),
    );
    expect(unreadable.error?.issues.map((i) => i.message)).toEqual([
      "That is not a roll I can read. Try 2d6+1.",
    ]);
  });

  it("lets only a stat with a die be global", () => {
    const flagged = (over: Partial<StatDefinition>): StatBlockDefinition => ({
      groups: [
        {
          name: "g",
          label: "",
          keyedBy: "",
          rollAll: false,
          canHaveMultiples: false,
          stats: [stat({ name: "x", type: "display", global: true, ...over })],
        },
      ],
    });
    // A pool, a dice stat and a display held to a number each have a die.
    expect(statBlockDefinitionSchema.safeParse(flagged({ type: "pool" })).success).toBe(true);
    expect(statBlockDefinitionSchema.safeParse(flagged({ type: "dice" })).success).toBe(true);
    expect(statBlockDefinitionSchema.safeParse(flagged({ format: "number" })).success).toBe(true);
    const plain = statBlockDefinitionSchema.safeParse(flagged({}));
    expect(plain.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["groups.0.stats.0.global", "Only a stat with a die can be rolled for all."],
    ]);
  });

  it("holds a display with a number format to a number", () => {
    const numbered: StatBlockDefinition = {
      groups: [
        {
          name: "stats",
          label: "",
          keyedBy: "",
          rollAll: false,
          canHaveMultiples: false,
          stats: [
            stat({ name: "str", type: "display", format: "number" }),
            stat({ name: "mod", type: "display", format: "number +/-" }),
          ],
        },
      ],
    };
    const numberedSchema = statBlockSchema(numbered);
    const refused = numberedSchema.safeParse({
      stats: { str: { value: "strong" }, mod: { value: "-2" } },
    });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["stats.str.value", "Enter a number."],
    ]);
    const parsed = numberedSchema.safeParse({
      stats: { str: { value: "14" }, mod: { value: "-2" } },
    });
    expect(parsed.data).toEqual({ stats: { str: { value: 14 }, mod: { value: -2 } } });
  });

  it("refuses what the stats cannot hold, on the field", () => {
    const errors = errorsOf(
      schema.safeParse({
        stats: { str: { value: 14 } },
        combat: {
          hp: { value: 2 },
          mana: { value: 7, min: 6, max: 5 },
          rage: { value: -1, max: -2 },
          die: { value: "d20" },
        },
      }),
    );
    expect(errors).toEqual({
      "combat.mana.min": "The min is above the max.",
      "combat.mana.value": "That is above the max of 5.",
      "combat.rage.value": "A stack cannot go below 0.",
      "combat.rage.max": "A max cannot be below 0.",
      "combat.die.value": "Choose one of the rack's entries.",
    });
  });

  it("writes dice as xdy, counting one die when the count is left off, and keeps a blank", () => {
    const dice = statBlockSchema({
      groups: [
        {
          name: "arms",
          label: "Arms",
          keyedBy: "",
          rollAll: false,
          canHaveMultiples: false,
          stats: [stat({ name: "damage", type: "dice" })],
        },
      ],
    });
    const parsed = dice.safeParse({ arms: { damage: { value: " D8 " } } });
    expect(parsed.success && parsed.data).toEqual({ arms: { damage: { value: "1d8" } } });
    const added = dice.safeParse({ arms: { damage: { value: "2d6 + 2" } } });
    expect(added.success && added.data).toEqual({ arms: { damage: { value: "2d6+2" } } });
    const blank = dice.safeParse({ arms: { damage: { value: "" } } });
    expect(blank.success && blank.data).toEqual({ arms: { damage: {} } });
    const errors = errorsOf(dice.safeParse({ arms: { damage: { value: "six" } } }));
    expect(errors).toEqual({ "arms.damage.value": "Write dice as 2d6, d8 or 2d6+2." });
  });

  it("wants a number where one is needed, but lets any box stay blank", () => {
    const errors = errorsOf(
      schema.safeParse({
        stats: { str: { value: 14 } },
        combat: {
          hp: { value: "" },
          mana: { value: "two", max: "" },
          rage: { value: "", max: "x" },
          die: { value: "d4" },
        },
      }),
    );
    expect(errors).toEqual({
      "combat.mana.value": "Enter a number.",
      "combat.rage.max": "Enter a number.",
    });
    const blank = schema.safeParse({
      stats: { str: { value: "" } },
      combat: {
        hp: { value: "" },
        mana: { value: "", min: "", max: "5" },
        rage: {},
        die: { value: "d4" },
      },
    });
    expect(blank.success && blank.data).toEqual({
      stats: { str: {} },
      combat: { hp: { min: 0 }, mana: { min: 0, max: 5 }, rage: {}, die: { value: "d4" } },
    });
  });
});

describe("statBlockSchema with a repeating group", () => {
  const schema = statBlockSchema(definition);
  const plain = {
    stats: { str: { value: "14" } },
    combat: {
      hp: { value: "9" },
      mana: { value: 3, min: 1, max: 5 },
      rage: { value: "0" },
      die: { value: "d4" },
    },
  };
  const row = (weapon: string, strike: string, over: Record<string, unknown> = {}) => ({
    weapon: { value: weapon },
    strike: { value: strike },
    die: { value: "d4" },
    sides: { value: 4 },
    uses: { value: "0", min: "" },
    ...over,
  });

  it("takes rows, each checked as the group's stats are, with the key filled and distinct", () => {
    const parsed = schema.safeParse({
      ...plain,
      attack: [row(" Sword ", "4", { die: { value: "d6" } }), row("sword", "1")],
    });
    expect(parsed.success).toBe(true);
    const uses = { value: 0, min: 0 };
    expect((parsed.data as StatBlock).attack).toEqual([
      {
        weapon: { value: "Sword" },
        strike: { value: 4 },
        die: { value: "d6" },
        sides: { value: 4 },
        uses,
      },
      {
        weapon: { value: "sword" },
        strike: { value: 1 },
        die: { value: "d4" },
        sides: { value: 4 },
        uses,
      },
    ]);
  });

  it("takes a row's multiple in a group that can have them, 1 or more and whole", () => {
    const withMultiples = statBlockSchema({
      groups: definition.groups.map((group) =>
        group.name === "attack" ? { ...group, canHaveMultiples: true } : group,
      ),
    });
    // As the row's Multiple box posts it: text, read as its number; blank is none set.
    const parsed = withMultiples.safeParse({
      ...plain,
      attack: [row("Sword", "4", { [MULTIPLE]: { value: "4" } }), row("Fist", "1")],
    });
    expect(parsed.success && (parsed.data.attack as StatRow[])[0][MULTIPLE]).toEqual({ value: 4 });
    expect(parsed.success && MULTIPLE in (parsed.data.attack as StatRow[])[1]).toBe(false);
    expect(
      withMultiples.safeParse({
        ...plain,
        attack: [row("Sword", "4", { [MULTIPLE]: { value: "" } })],
      }).success,
    ).toBe(true);
    expect(
      errorsOf(
        withMultiples.safeParse({
          ...plain,
          attack: [row("Sword", "4", { [MULTIPLE]: { value: "0" } })],
        }),
      ),
    ).toEqual({ "attack.0.$multiple.value": "At least once." });
    expect(
      errorsOf(
        withMultiples.safeParse({
          ...plain,
          attack: [row("Sword", "4", { [MULTIPLE]: { value: "2.5" } })],
        }),
      ),
    ).toEqual({ "attack.0.$multiple.value": "A whole number of times." });
    // A group that cannot have multiples takes none: the key is dropped.
    const dropped = schema.safeParse({
      ...plain,
      attack: [row("Sword", "4", { [MULTIPLE]: { value: "4" } })],
    });
    expect(dropped.success && MULTIPLE in (dropped.data.attack as StatRow[])[0]).toBe(false);
  });

  it("takes no rows at all, posted as an empty array or left out", () => {
    expect(schema.safeParse({ ...plain, attack: [] }).success).toBe(true);
    expect(schema.safeParse(plain).success).toBe(true);
  });

  it("refuses an empty key and a duplicate, on the later row's key field", () => {
    const result = schema.safeParse({
      ...plain,
      attack: [row("Sword", "4"), row("", "1"), row("Sword", "2")],
    });
    expect(errorsOf(result)).toEqual({
      "attack.1.weapon.value": "Every row needs one.",
      "attack.2.weapon.value": "Another row has this Weapon.",
    });
  });

  it('treats 6 and "6" as one key when the key is a rack', () => {
    const keyedBySides = statBlockSchema(withKey(definition, "attack", "sides"));
    const result = keyedBySides.safeParse({
      ...plain,
      attack: [row("a", "1", { sides: { value: 6 } }), row("b", "1", { sides: { value: "6" } })],
    });
    expect(errorsOf(result)).toEqual({ "attack.1.sides.value": "Another row has this sides." });
  });

  it("refuses an object where rows are expected, rows where one record is, and more than 50 rows", () => {
    expect(errorsOf(schema.safeParse({ ...plain, attack: {} }))).toHaveProperty("attack");
    expect(errorsOf(schema.safeParse({ ...plain, stats: [] }))).toHaveProperty("stats");
    const many = Array.from({ length: 51 }, (_, i) => row(`w${i}`, "1"));
    expect(errorsOf(schema.safeParse({ ...plain, attack: many }))).toEqual({
      attack: "Keep it under 50 rows.",
    });
  });
});

describe("statBlocksSchema", () => {
  const systems = [{ idSystem: -90, label: "Palladium", definition }];

  it("checks each system's block and keys an error by the system", () => {
    const good = statBlocksSchema(systems).safeParse({
      "-90": {
        stats: { str: { value: 14 } },
        combat: {
          hp: { value: 1 },
          mana: { value: 0, max: 0 },
          rage: { value: 0 },
          die: { value: "d4" },
        },
      },
    });
    expect(good.success).toBe(true);
    expect((good.data?.["-90"].combat as StatRow).hp).toEqual({ value: 1, min: 0 });

    const bad = statBlocksSchema(systems).safeParse({
      "-90": {
        stats: { str: { value: 14 } },
        combat: {
          hp: { value: 99, max: 14 },
          mana: { value: 0, max: 0 },
          rage: { value: 0 },
          die: { value: "d4" },
        },
      },
      "-1": {},
    });
    expect(errorsOf(bad)).toEqual({
      "-90.combat.hp.value": "That is above the max of 14.",
      "-1": "That system has no stats to fill in.",
    });
  });
});

describe("readStatBlocks", () => {
  it("keeps an array of records under a group, and drops a system whose rows are not records", () => {
    const rows = { "-90": { attack: [{ weapon: { value: "Sword" } }, {}] } };
    expect(readStatBlocks(rows)).toEqual(rows);
    expect(readStatBlocks({ "-90": { attack: [3] } })).toEqual({});
  });

  it("keeps the outer shape and lets each stat be judged later", () => {
    const blocks = { "-90": { stats: { str: { value: "anything" }, odd: { nothing: true } } } };
    expect(readStatBlocks(blocks)).toEqual(blocks);
    expect(readStatBlocks(null)).toEqual({});
    expect(readStatBlocks({ "-90": { stats: { str: 3 } } })).toEqual({});
  });
});
