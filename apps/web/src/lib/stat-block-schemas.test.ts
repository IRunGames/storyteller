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
import type { StatBlock, StatBlockDefinition, StatDefinition } from "./stat-blocks";

const stat = (
  over: Partial<StatDefinition> & Pick<StatDefinition, "name" | "type">,
): StatDefinition => ({
  label: "",
  rack: [],
  connectedTo: "",
  computedAs: "",
  ...over,
});

const definition: StatBlockDefinition = {
  groups: [
    {
      name: "stats",
      label: "Stats",
      stats: [
        stat({ name: "str", type: "display" }),
        stat({ name: "mod", type: "computed", computedAs: "floor((stats.str - 10) / 2)" }),
      ],
    },
    {
      name: "combat",
      label: "Combat",
      stats: [
        stat({ name: "hp", type: "pool", connectedTo: "stats.str" }),
        stat({ name: "mana", type: "pool" }),
        stat({ name: "rage", type: "stack" }),
        stat({ name: "die", type: "rack", rack: ["d4", "d6", 8] }),
      ],
    },
  ],
};

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
        groups: [{ name: "saves", label: "Saves", stats: [] }],
      }).success,
    ).toBe(true);
  });

  it("holds names to identifiers, unique in their group, on the field that breaks it", () => {
    const errors = errorsOf(
      statBlockDefinitionSchema.safeParse({
        groups: [
          { name: "Stats", label: "", stats: [] },
          {
            name: "a",
            label: "",
            stats: [stat({ name: "x", type: "display" }), stat({ name: "x", type: "display" })],
          },
          { name: "a", label: "", stats: [] },
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
            stats: [
              stat({ name: "a", type: "rack" }),
              stat({ name: "b", type: "display", rack: ["d4"] }),
              stat({ name: "c", type: "computed" }),
              stat({ name: "d", type: "display", computedAs: "1 + 1" }),
              stat({ name: "e", type: "rack", rack: ["d4"], connectedTo: "b" }),
              stat({ name: "f", type: "computed", computedAs: "1 +" }),
            ],
          },
        ],
      }),
    );
    expect(errors["groups.0.stats.0.rack"]).toBe("A rack needs at least one entry.");
    expect(errors["groups.0.stats.1.rack"]).toBe("Only a rack has entries.");
    expect(errors["groups.0.stats.2.computedAs"]).toBe("A computed stat needs a formula.");
    expect(errors["groups.0.stats.3.computedAs"]).toBe("Only a computed stat has a formula.");
    expect(errors["groups.0.stats.4.connectedTo"]).toMatch(/Only a display, a pool or a stack/);
    expect(errors["groups.0.stats.5.computedAs"]).toBe(
      "The formula ends too soon. (at character 4)",
    );
  });

  it("wants every connection and reference to point at a stat that is there", () => {
    const errors = errorsOf(
      statBlockDefinitionSchema.safeParse({
        groups: [
          {
            name: "g",
            label: "",
            stats: [
              stat({ name: "a", type: "display", connectedTo: "nothing" }),
              stat({ name: "b", type: "display", connectedTo: "b" }),
              stat({ name: "c", type: "computed", computedAs: "g.nothing + 1" }),
              stat({ name: "d", type: "computed", computedAs: "g.a.max" }),
              stat({ name: "e", type: "pool" }),
              stat({ name: "f", type: "computed", computedAs: "g.e.max + g.e.min" }),
            ],
          },
        ],
      }),
    );
    expect(errors["groups.0.stats.0.connectedTo"]).toBe(
      "There is no stat nothing. Name one as stat or group.stat.",
    );
    expect(errors["groups.0.stats.1.connectedTo"]).toBe("A stat cannot feed itself.");
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
            stats: [
              stat({ name: "a", type: "computed", computedAs: "g.b + 1" }),
              stat({ name: "b", type: "display", connectedTo: "c" }),
              stat({ name: "c", type: "display", connectedTo: "a" }),
              stat({ name: "d", type: "display", connectedTo: "a" }),
            ],
          },
        ],
      }),
    );
    expect(errors["groups.0.stats.0.computedAs"]).toBe("This stat ends up depending on itself.");
    expect(errors["groups.0.stats.1.connectedTo"]).toBe("This stat ends up depending on itself.");
    expect(errors["groups.0.stats.2.connectedTo"]).toBe("This stat ends up depending on itself.");
    expect(errors["groups.0.stats.3.connectedTo"]).toBeUndefined();
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
          stats: [
            stat({ name: "die", type: "rack", rack: " d4, d6 ,8,, " as unknown as never }),
            stat({
              name: "x",
              type: "display",
              connectedTo: "nothing",
              rack: "" as unknown as never,
            }),
          ],
        },
      ],
    });
    expect(parsed.success).toBe(false);
    expect(errorsOf(parsed)).toEqual({
      "groups.0.stats.1.connectedTo": "There is no stat nothing. Name one as stat or group.stat.",
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
        hp: { value: 9, min: 0 },
        mana: { value: 3, min: 1, max: 5 },
        rage: { value: 2 },
        die: { value: 8 },
      },
    });
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
    expect((parsed.data as StatBlock).stats.str).toEqual({ value: "mighty" });
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

  it("holds a value to the max that feeds it, once the shape is right", () => {
    const errors = errorsOf(
      schema.safeParse({
        stats: { str: { value: 14 } },
        combat: {
          // hp's max is str, 14.
          hp: { value: 20 },
          mana: { value: 0, max: 0 },
          rage: { value: 0 },
          die: { value: "d4" },
        },
      }),
    );
    expect(errors).toEqual({ "combat.hp.value": "That is above the max of 14." });
  });

  it("wants a number where one is needed", () => {
    const errors = errorsOf(
      schema.safeParse({
        stats: { str: { value: 14 } },
        combat: {
          hp: { value: "" },
          mana: { value: "two", max: 5 },
          rage: {},
          die: { value: "d4" },
        },
      }),
    );
    expect(errors["combat.hp.value"]).toBe("Enter a number.");
    expect(errors["combat.mana.value"]).toBe("Enter a number.");
    expect(errors["combat.rage.value"]).toBe("Enter a number.");
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
    expect(good.data?.["-90"].combat.hp).toEqual({ value: 1, min: 0 });

    const bad = statBlocksSchema(systems).safeParse({
      "-90": {
        stats: { str: { value: 14 } },
        combat: {
          hp: { value: 99 },
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
  it("keeps the outer shape and lets each stat be judged later", () => {
    const blocks = { "-90": { stats: { str: { value: "anything" }, odd: { nothing: true } } } };
    expect(readStatBlocks(blocks)).toEqual(blocks);
    expect(readStatBlocks(null)).toEqual({});
    expect(readStatBlocks({ "-90": { stats: { str: 3 } } })).toEqual({});
  });
});
