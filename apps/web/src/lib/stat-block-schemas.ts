import { z } from "zod";
import {
  canConnect,
  EMPTY_DEFINITION,
  evaluateStatBlock,
  findStat,
  isRepeating,
  matchRackEntry,
  resolveConnection,
  rowKeyText,
  STAT_TYPES,
  statLabel,
  type RackEntry,
  type StatBlock,
  type StatBlockDefinition,
  type StatBlocks,
  type StatBlockSystem,
  type EvaluatedStat,
  type StatGroupDefinition,
  type StatDefinition,
  type StatRow,
} from "./stat-blocks";
import { formulaReferences, parseFormula } from "./stat-formula";

// The zod side of stat blocks (lib/stat-blocks.ts has the shapes and the
// reading): what the administrators' editor and the element forms check
// in the browser, run again by the actions that save them, so both refuse
// the same things.

const MAX_GROUPS = 20;
const MAX_STATS = 50;
const MAX_RACK = 50;
const MAX_ROWS = 50;
const MAX_LABEL = 60;
const MAX_FORMULA = 500;
/** On the serialised definition, as a user preference is capped (user-preference-schemas.ts). */
const MAX_DEFINITION_LENGTH = 50_000;

const identifierSchema = z
  .string()
  .trim()
  .min(1, "Please give it a name.")
  .max(40, "Keep the name under 40 characters.")
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "A name is lower-case letters, digits and underscores, starting with a letter.",
  );

const labelSchema = z
  .string()
  .trim()
  .max(MAX_LABEL, `Keep the label under ${MAX_LABEL} characters.`);

const rackEntrySchema = z.union([
  z.number(),
  z.string().trim().min(1).max(40, "Keep a rack entry under 40 characters."),
]);

export const statDefinitionSchema = z.object({
  name: identifierSchema,
  label: labelSchema,
  type: z.enum(STAT_TYPES, { error: "Choose what kind of stat this is." }),
  rack: z.array(rackEntrySchema).max(MAX_RACK, `Keep a rack under ${MAX_RACK} entries.`),
  connectedTo: z.string().trim().max(100, "Keep the connection under 100 characters."),
  computedAs: z
    .string()
    .trim()
    .max(MAX_FORMULA, `Keep the formula under ${MAX_FORMULA} characters.`),
});

export const statGroupDefinitionSchema = z.object({
  name: identifierSchema,
  label: labelSchema,
  keyedBy: z.string().trim().max(40, "Keep the key under 40 characters."),
  stats: z.array(statDefinitionSchema).max(MAX_STATS, `Keep a group under ${MAX_STATS} stats.`),
});

type Issue = { path: (string | number)[]; message: string };

/**
 * The rules a definition keeps beyond its shape, each said on the field
 * that breaks it: names unique, each type with the fields it needs and no
 * other, every connection and formula reference pointing at a stat that
 * exists, and no stat fed, directly or through others, by itself.
 */
function checkDefinition(definition: StatBlockDefinition): Issue[] {
  const issues: Issue[] = [];
  const groupNames = new Set<string>();
  // Who each stat depends on, for the cycle walk below.
  const dependencies = new Map<string, string[]>();
  const groupOf = (name: string) => definition.groups.find((group) => group.name === name);
  // A repeating group has no one value to read, so only its own stats, which
  // read their own row, may name one of them.
  const readsIntoRows = (from: string, target: { group: string }) => {
    const targetGroup = groupOf(target.group);
    return targetGroup !== undefined && isRepeating(targetGroup) && target.group !== from;
  };
  const rowsMessage = (target: { group: string; stat: string }) =>
    `${target.group} repeats; only a stat in ${target.group} can read ${target.group}.${target.stat}.`;

  definition.groups.forEach((group, g) => {
    if (groupNames.has(group.name)) {
      issues.push({ path: ["groups", g, "name"], message: "Another group has this name." });
    }
    groupNames.add(group.name);
    const statNames = new Set<string>();

    if (isRepeating(group)) {
      const key = group.stats.find((stat) => stat.name === group.keyedBy);
      if (!key) {
        issues.push({
          path: ["groups", g, "keyedBy"],
          message: `There is no stat ${group.keyedBy} in this group.`,
        });
      } else if (key.type !== "display" && key.type !== "rack") {
        // A pool or stack is spent and refilled and a computed stat stores
        // nothing, so none of them can tell one row from another.
        issues.push({
          path: ["groups", g, "keyedBy"],
          message:
            "A key is a display or a rack; a pool, stack or computed stat cannot tell rows apart.",
        });
      } else if (resolveConnection(definition, group.name, key.connectedTo) !== null) {
        issues.push({
          path: ["groups", g, "keyedBy"],
          message: "A fed display is the same on every row; choose a stat the row holds itself.",
        });
      }
    }

    group.stats.forEach((stat, s) => {
      const at = (field: keyof StatDefinition) => ["groups", g, "stats", s, field];
      if (statNames.has(stat.name)) {
        issues.push({ path: at("name"), message: "Another stat in this group has this name." });
      }
      statNames.add(stat.name);
      const deps: string[] = [];

      if (stat.type === "rack" && stat.rack.length === 0) {
        issues.push({ path: at("rack"), message: "A rack needs at least one entry." });
      }
      if (stat.type !== "rack" && stat.rack.length > 0) {
        issues.push({ path: at("rack"), message: "Only a rack has entries." });
      }

      if (stat.type === "computed") {
        if (stat.computedAs === "") {
          issues.push({ path: at("computedAs"), message: "A computed stat needs a formula." });
        } else {
          const parsed = parseFormula(stat.computedAs);
          if (!parsed.ok) {
            issues.push({
              path: at("computedAs"),
              message: `${parsed.message} (at character ${parsed.position + 1})`,
            });
          } else {
            for (const reference of formulaReferences(parsed.tree)) {
              const target = findStat(definition, reference.group, reference.stat);
              if (!target) {
                issues.push({
                  path: at("computedAs"),
                  message: `There is no stat ${reference.group}.${reference.stat}.`,
                });
              } else if (readsIntoRows(group.name, reference)) {
                issues.push({ path: at("computedAs"), message: rowsMessage(reference) });
              } else if (
                reference.part !== "value" &&
                target.type !== "pool" &&
                target.type !== "stack"
              ) {
                issues.push({
                  path: at("computedAs"),
                  message: `${reference.group}.${reference.stat} has no ${reference.part}; only a pool or a stack has one.`,
                });
              } else {
                deps.push(`${reference.group}.${reference.stat}`);
              }
            }
          }
        }
      } else if (stat.computedAs !== "") {
        issues.push({ path: at("computedAs"), message: "Only a computed stat has a formula." });
      }

      if (stat.connectedTo !== "") {
        if (!canConnect(stat.type)) {
          issues.push({
            path: at("connectedTo"),
            message: "Only a display, a pool or a stack can be connected to another stat.",
          });
        } else {
          const target = resolveConnection(definition, group.name, stat.connectedTo);
          if (!target) {
            issues.push({
              path: at("connectedTo"),
              message: `There is no stat ${stat.connectedTo}. Name one as stat or group.stat.`,
            });
          } else if (target.group === group.name && target.stat === stat.name) {
            issues.push({ path: at("connectedTo"), message: "A stat cannot feed itself." });
          } else if (readsIntoRows(group.name, target)) {
            issues.push({ path: at("connectedTo"), message: rowsMessage(target) });
          } else {
            deps.push(`${target.group}.${target.stat}`);
          }
        }
      }

      dependencies.set(`${group.name}.${stat.name}`, deps);
    });
  });

  // A depth-first walk from every stat over what it depends on: coming back
  // to the stat it started from is a cycle, reported on that stat's field
  // that leads out of it. Only the stats in the loop are reported, not one
  // that merely reads a stat in the loop, so the message lands where the
  // fix is. Quadratic in the number of stats, which is bounded above.
  const dependsOnItself = (start: string): boolean => {
    const seen = new Set<string>();
    const walk = (id: string): boolean =>
      (dependencies.get(id) ?? []).some((dep) => {
        if (dep === start) return true;
        if (seen.has(dep)) return false;
        seen.add(dep);
        return walk(dep);
      });
    return walk(start);
  };
  definition.groups.forEach((group, g) => {
    group.stats.forEach((stat, s) => {
      const id = `${group.name}.${stat.name}`;
      if (dependsOnItself(id)) {
        issues.push({
          path: ["groups", g, "stats", s, stat.type === "computed" ? "computedAs" : "connectedTo"],
          message: "This stat ends up depending on itself.",
        });
      }
    });
  });

  return issues;
}

/**
 * A whole definition, shape and rules, as the editor posts it and the
 * column holds it.
 */
export const statBlockDefinitionSchema = z
  .object({
    groups: z
      .array(statGroupDefinitionSchema)
      .max(MAX_GROUPS, `Keep it under ${MAX_GROUPS} groups.`),
  })
  .superRefine((definition, ctx) => {
    if (JSON.stringify(definition).length > MAX_DEFINITION_LENGTH) {
      ctx.addIssue({
        code: "custom",
        path: ["groups"],
        message: `Keep the definition under ${MAX_DEFINITION_LENGTH} characters.`,
      });
      return;
    }
    for (const issue of checkDefinition(definition)) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

/**
 * A rack as the editor's one text field holds it, "d4, d6, d8", split on
 * commas with a number kept as a number ("6" is the entry 6), so the rack
 * reads the same whether it was typed or stored.
 */
export function splitRack(text: string): RackEntry[] {
  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => (/^-?\d+(\.\d+)?$/.test(entry) ? Number(entry) : entry));
}

/** A rack as the editor's field shows it. */
export function joinRack(rack: RackEntry[]): string {
  return rack.map(String).join(", ");
}

/**
 * The editor's form: the definition with each rack as its text field, piped
 * into the real schema so the rules above land on the same paths.
 */
export const statBlockDefinitionFormSchema = z
  .object({
    groups: z.array(
      statGroupDefinitionSchema.extend({
        stats: z.array(statDefinitionSchema.extend({ rack: z.string().transform(splitRack) })),
      }),
    ),
  })
  .pipe(statBlockDefinitionSchema);

export type StatBlockDefinitionFormInput = z.input<typeof statBlockDefinitionFormSchema>;

/**
 * What a definition column holds, as a definition; the empty one for
 * anything that does not parse, since a row's jsonb is only as sound as
 * what last wrote it and a page is better empty than broken.
 */
export function readStatBlockDefinition(raw: unknown): StatBlockDefinition {
  const parsed = statBlockDefinitionSchema.safeParse(withKeys(raw));
  return parsed.success ? parsed.data : EMPTY_DEFINITION;
}

/**
 * A stored definition with keyedBy on every group: columns written before
 * groups could repeat have none, and read as plain groups rather than
 * failing whole. Anything that is not the expected shape is handed on as it
 * is for the schema to refuse.
 */
function withKeys(raw: unknown): unknown {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !Array.isArray((raw as { groups?: unknown }).groups)
  ) {
    return raw;
  }
  const groups = (raw as { groups: unknown[] }).groups.map((group) =>
    typeof group === "object" && group !== null && !("keyedBy" in group)
      ? { ...group, keyedBy: "" }
      : group,
  );
  return { ...raw, groups };
}

// A number as an input posts it: "" and whitespace for nothing, digits for
// a number, anything else left for the number check to refuse. The optional
// form carries the preprocess inside, since an optional wrapper only lets
// an undefined through before the preprocess has turned "" into one.
const asNumber = (value: unknown) => {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text === "") return undefined;
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : value;
};
const numberInput = z.preprocess(asNumber, z.number({ error: "Enter a number." }));
const optionalNumberInput = z.preprocess(
  asNumber,
  z.number({ error: "Enter a number." }).optional(),
);

// A display's value: a number when it reads as one, else the words.
const displayValue = z.preprocess(
  (value) =>
    typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value,
  z.union([z.number(), z.string().trim().max(200, "Keep it under 200 characters.")]),
);

/**
 * The schema for one stat's stored value, by its type and whether a
 * connection feeds it. Stored keys the type does not have are dropped
 * (zod strips what an object does not name), which is how a stale max is
 * shed. A computed stat, or a fed display, stores nothing at all.
 */
function statValueSchema(stat: StatDefinition, connected: boolean) {
  switch (stat.type) {
    case "display":
      return connected ? z.object({}) : z.object({ value: displayValue });
    case "pool": {
      const base = z.object({
        value: numberInput,
        min: optionalNumberInput.transform((min) => min ?? 0),
        ...(connected ? {} : { max: numberInput }),
      });
      return base.superRefine((pool, ctx) => {
        if ("max" in pool && typeof pool.max === "number" && pool.min > pool.max) {
          ctx.addIssue({ code: "custom", path: ["min"], message: "The min is above the max." });
        }
        if (pool.value < pool.min) {
          ctx.addIssue({ code: "custom", path: ["value"], message: "That is below the min." });
        }
        if ("max" in pool && typeof pool.max === "number" && pool.value > pool.max) {
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: `That is above the max of ${pool.max}.`,
          });
        }
      });
    }
    case "stack":
      return z
        .object({
          value: numberInput,
          ...(connected ? {} : { max: optionalNumberInput }),
        })
        .superRefine((stack, ctx) => {
          if (stack.value < 0) {
            ctx.addIssue({
              code: "custom",
              path: ["value"],
              message: "A stack cannot go below 0.",
            });
          }
          if ("max" in stack && typeof stack.max === "number" && stack.max < 0) {
            ctx.addIssue({ code: "custom", path: ["max"], message: "A max cannot be below 0." });
          }
          if ("max" in stack && typeof stack.max === "number" && stack.value > stack.max) {
            ctx.addIssue({
              code: "custom",
              path: ["value"],
              message: `That is above the max of ${stack.max}.`,
            });
          }
        });
    case "rack":
      return z.object({
        value: z.union([z.number(), z.string()]).transform((value, ctx) => {
          const entry = matchRackEntry(stat.rack, value);
          if (entry === null) {
            ctx.addIssue({ code: "custom", message: "Choose one of the rack's entries." });
            return z.NEVER;
          }
          return entry;
        }),
      });
    case "computed":
      return z.object({});
  }
}

/**
 * The schema for one system's block, built from its definition so the
 * numbers are checked against the stats the system has. Every stat of
 * every group is required (the form always posts the whole block), and
 * after the shape, the block is worked out and a pool's or stack's value is
 * held to the max that feeds it, which only the evaluation knows. That
 * check runs once the shape is right, as zod runs an object's refinement
 * only when every field parsed, so a block with a word where a number
 * should be hears about the word first and the max on the next try.
 */
export function statBlockSchema(definition: StatBlockDefinition) {
  const groups: Record<string, z.ZodType> = {};
  for (const group of definition.groups) {
    const stats: Record<string, z.ZodType> = {};
    for (const stat of group.stats) {
      const connected = canConnect(stat.type)
        ? resolveConnection(definition, group.name, stat.connectedTo) !== null
        : false;
      const schema = statValueSchema(stat, connected);
      // Nothing is stored for a computed stat or a fed display, so the key
      // may be missing; every other stat must be posted.
      stats[stat.name] =
        stat.type === "computed" || (stat.type === "display" && connected)
          ? schema.optional()
          : schema;
    }
    const row = z.object(stats);
    groups[group.name] = isRepeating(group) ? rowsSchema(group, row).optional() : row;
  }
  return z.object(groups).superRefine((block, ctx) => {
    for (const group of evaluateStatBlock(definition, block as StatBlock)) {
      const checkFedMax = (stat: EvaluatedStat, path: (string | number)[]) => {
        // A stored max was held to above; here only the max a connection feeds.
        if (
          (stat.type === "pool" || stat.type === "stack") &&
          stat.maxFrom !== undefined &&
          typeof stat.value === "number" &&
          typeof stat.max === "number" &&
          stat.value > stat.max
        ) {
          ctx.addIssue({
            code: "custom",
            path: [...path, stat.name, "value"],
            message: `That is above the max of ${stat.max}.`,
          });
        }
      };
      for (const stat of group.stats) checkFedMax(stat, [group.name]);
      group.rows.forEach((row, i) => {
        for (const stat of row.stats) checkFedMax(stat, [group.name, i]);
      });
    }
  });
}

/**
 * A repeating group's rows: each a row as a plain group is checked, with
 * the key stat filled on every row and no two rows sharing a key. A
 * duplicate is reported on the later row, where the storyteller just typed
 * it. The array is optional in the block, since a field array with no rows
 * posts nothing for its key; absent and empty both mean no rows.
 */
function rowsSchema(group: StatGroupDefinition, row: z.ZodType) {
  const keyStat = group.stats.find((stat) => stat.name === group.keyedBy);
  return z
    .array(row)
    .max(MAX_ROWS, `Keep it under ${MAX_ROWS} rows.`)
    .superRefine((rows, ctx) => {
      if (!keyStat) return;
      const seen = new Set<string>();
      (rows as StatRow[]).forEach((stored, i) => {
        const text = rowKeyText(stored[keyStat.name]?.value);
        if (text === null) {
          ctx.addIssue({
            code: "custom",
            path: [i, keyStat.name, "value"],
            message: "Every row needs one.",
          });
        } else if (seen.has(text)) {
          ctx.addIssue({
            code: "custom",
            path: [i, keyStat.name, "value"],
            message: `Another row has this ${statLabel(keyStat)}.`,
          });
        } else {
          seen.add(text);
        }
      });
    });
}

/**
 * The blocks an element form posts: one per system it shows, each checked
 * against that system's definition, keyed by system id. A system the list
 * does not know, or one with nothing to fill in, is refused on its key.
 */
export function statBlocksSchema(systems: StatBlockSystem[]) {
  const byKey = new Map(systems.map((system) => [String(system.idSystem), system]));
  return z.record(z.string(), z.unknown()).superRefine((blocks, ctx) => {
    for (const [key, block] of Object.entries(blocks)) {
      const system = byKey.get(key);
      if (!system) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "That system has no stats to fill in.",
        });
        continue;
      }
      const parsed = statBlockSchema(system.definition).safeParse(block);
      if (parsed.success) {
        blocks[key] = parsed.data;
      } else {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({ code: "custom", path: [key, ...issue.path], message: issue.message });
        }
      }
    }
  }) as z.ZodType<StatBlocks, Record<string, unknown>>;
}

/**
 * What an elements.stat_blocks column holds, loosely: system keys to groups
 * to stats to objects, or to an array of such records for a group that
 * repeats. Each stat is then read against its definition by
 * evaluateStatBlock, and each row by tidyStatBlock, which is where a value
 * that no longer fits is let go.
 */
const looseRow = z.record(z.string(), z.record(z.string(), z.unknown()));
const looseBlocksSchema = z.record(
  z.string(),
  z.record(z.string(), z.union([looseRow, z.array(looseRow)])),
);

export function readStatBlocks(raw: unknown): StatBlocks {
  const parsed = looseBlocksSchema.safeParse(raw);
  return parsed.success ? (parsed.data as StatBlocks) : {};
}
