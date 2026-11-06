// Stat blocks: what a game system says an element can carry (its
// definition, on systems.stat_block_definition) and what one element does
// carry (its block, on elements.stat_blocks). GLOSSARY.md has the words. No
// React and no zod here: the shapes, how a block is read against its
// definition, and how a stat's shown value is worked out, for the server
// actions, the forms and the table alike. The zod schemas that check the
// shapes are in stat-block-schemas.ts.
import { evaluateFormula, parseFormula, type FormulaNode } from "./stat-formula";

export const STAT_TYPES = ["display", "pool", "stack", "rack", "computed"] as const;
export type StatType = (typeof STAT_TYPES)[number];

export const STAT_TYPE_LABELS: Record<StatType, string> = {
  display: "Display",
  pool: "Pool",
  stack: "Stack",
  rack: "Rack",
  computed: "Computed",
};

/** One entry of a rack: "d6", or 3. */
export type RackEntry = string | number;

/**
 * One stat of a definition. Every field is present, an empty string or
 * array standing for "none", so the editor's rows and the stored jsonb are
 * one shape.
 */
export type StatDefinition = {
  /** The key, /^[a-z][a-z0-9_]*$/, unique within its group; what formulas name. */
  name: string;
  /** What is shown; "" means show the name. */
  label: string;
  type: StatType;
  /** A rack's entries in order; [] for any other type. */
  rack: RackEntry[];
  /** "" or "stat" (same group) or "group.stat"; a display, pool or stack only. */
  connectedTo: string;
  /** A computed stat's formula (stat-formula.ts); "" for any other type. */
  computedAs: string;
};

export type StatGroupDefinition = { name: string; label: string; stats: StatDefinition[] };
export type StatBlockDefinition = { groups: StatGroupDefinition[] };

export const EMPTY_DEFINITION: StatBlockDefinition = { groups: [] };

/**
 * What an element stores for one stat. One key, value, for the current
 * value of every type; a pool adds min and max, a stack a max. A rack
 * stores the entry itself rather than its index, so a rack that grows in
 * the middle does not shift every element's reading.
 */
export type StatValue = {
  value: number | string;
  /** Pool only; 0 when absent. */
  min?: number;
  /** Pool and stack; absent when fed by a connection, or, on a stack, when unbounded. */
  max?: number;
};

export type StatBlock = Record<string, Record<string, StatValue>>;
/** Keyed by id_system as a string, since it is a JSON key. */
export type StatBlocks = Record<string, StatBlock>;

/** A system an element can carry a block for: its definition has at least one group. */
export type StatBlockSystem = { idSystem: number; label: string; definition: StatBlockDefinition };

/** What the stat is called where it is shown. */
export function statLabel(stat: Pick<StatDefinition, "name" | "label">): string {
  return stat.label || stat.name;
}

/** The key a system's block is stored under. */
export function systemKey(idSystem: number): string {
  return String(idSystem);
}

/** Whether a definition has anything to draw. */
export function hasStats(definition: StatBlockDefinition): boolean {
  return definition.groups.some((group) => group.stats.length > 0);
}

/** Finds a stat by group and name; null when either is not there. */
export function findStat(
  definition: StatBlockDefinition,
  group: string,
  stat: string,
): StatDefinition | null {
  return (
    definition.groups
      .find((candidate) => candidate.name === group)
      ?.stats.find((candidate) => candidate.name === stat) ?? null
  );
}

/**
 * Where a connectedTo points: "ar" means the stat of that name in the same
 * group, "defense.ar" the stat of a group. Null for "" and for anything
 * that is not there, so a connection is only ever to a stat that exists.
 */
export function resolveConnection(
  definition: StatBlockDefinition,
  fromGroup: string,
  connectedTo: string,
): { group: string; stat: string } | null {
  if (connectedTo === "") return null;
  const parts = connectedTo.split(".");
  const target =
    parts.length === 1
      ? { group: fromGroup, stat: parts[0] }
      : parts.length === 2
        ? { group: parts[0], stat: parts[1] }
        : null;
  if (!target || !findStat(definition, target.group, target.stat)) return null;
  return target;
}

/** Whether a stat of this type takes a connection at all. */
export function canConnect(type: StatType): boolean {
  return type === "display" || type === "pool" || type === "stack";
}

/** The entry of a rack a stored value names, matching 6 to "6" since a select posts strings. */
export function matchRackEntry(rack: RackEntry[], value: unknown): RackEntry | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return rack.find((entry) => entry === value || String(entry) === String(value)) ?? null;
}

const isFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * A stored value as far as it fits its stat today, or null for nothing
 * usable. Reads are lenient per stat: the definition may have changed since
 * the value was written (a type changed, a rack shrunk, a max fed by a
 * connection now), and a value that no longer fits reads as absent rather
 * than refusing the whole block, so nothing the storyteller did not touch
 * ever stands in their way. The next save of the block drops it.
 */
export function fitStatValue(
  stat: StatDefinition,
  connected: boolean,
  raw: unknown,
): StatValue | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { value, min, max } = raw as Record<string, unknown>;
  switch (stat.type) {
    case "display":
      if (connected) return null;
      if (isFinite(value)) return { value };
      if (typeof value === "string" && value.length <= 200) return { value };
      return null;
    case "pool": {
      if (!isFinite(value)) return null;
      const fitted: StatValue = { value, min: isFinite(min) ? min : 0 };
      if (!connected && isFinite(max)) fitted.max = max;
      return fitted;
    }
    case "stack": {
      if (!isFinite(value)) return null;
      const fitted: StatValue = { value };
      if (!connected && isFinite(max)) fitted.max = max;
      return fitted;
    }
    case "rack": {
      const entry = matchRackEntry(stat.rack, value);
      return entry === null ? null : { value: entry };
    }
    case "computed":
      return null;
  }
}

/** One stat as the block shows it, with what the controls need beside the value. */
export type EvaluatedStat = {
  name: string;
  label: string;
  type: StatType;
  /** The current value; null for nothing to show (unset, a formula that is not a number, a rack entry gone). */
  value: number | string | null;
  /** A pool's floor. */
  min?: number;
  /** A pool's or stack's ceiling; null for a stack with none, or a connection that is not a number. */
  max?: number | null;
  /** The label of the stat that feeds the max, when one does. */
  maxFrom?: string;
  /** The label of the stat that feeds the value, when one does (a connected display). */
  valueFrom?: string;
  /** A rack's entries, for the ◀ ▶ and the select, and where the value sits in them. */
  rack?: RackEntry[];
  rackIndex?: number;
  /** What the element stores for it, as far as it fits; null for a computed or fed display. */
  stored: StatValue | null;
};

export type EvaluatedGroup = { name: string; label: string; stats: EvaluatedStat[] };

/**
 * A block worked out against its definition: every group and stat in the
 * definition's order, each with the value to show and, by type, its min,
 * max and rack. A fed part comes from the stat it is connected to; a
 * computed stat from its formula over the others, memoised so a stat read
 * by three formulas is worked out once. The definition schema has refused
 * cycles, and a visiting set stops one anyway should a definition arrive
 * some other way.
 */
export function evaluateStatBlock(
  definition: StatBlockDefinition,
  block: StatBlock | undefined,
): EvaluatedGroup[] {
  const done = new Map<string, EvaluatedStat>();
  const visiting = new Set<string>();
  const trees = new Map<string, FormulaNode | null>();

  const key = (group: string, stat: string) => `${group}.${stat}`;

  function evaluate(groupName: string, stat: StatDefinition): EvaluatedStat {
    const id = key(groupName, stat.name);
    const known = done.get(id);
    if (known) return known;
    const base: EvaluatedStat = {
      name: stat.name,
      label: statLabel(stat),
      type: stat.type,
      value: null,
      stored: null,
    };
    if (visiting.has(id)) return base;
    visiting.add(id);

    const connection = canConnect(stat.type)
      ? resolveConnection(definition, groupName, stat.connectedTo)
      : null;
    const fed = connection
      ? evaluate(connection.group, findStat(definition, connection.group, connection.stat)!)
      : null;
    const stored = fitStatValue(stat, connection !== null, block?.[groupName]?.[stat.name]);
    const result: EvaluatedStat = { ...base, stored };

    switch (stat.type) {
      case "display":
        if (fed) {
          result.value = fed.value;
          result.valueFrom = fed.label;
        } else {
          result.value = stored?.value ?? null;
        }
        break;
      case "pool":
        result.value = stored?.value ?? null;
        result.min = stored?.min ?? 0;
        if (fed) {
          result.max = isFinite(fed.value) ? fed.value : null;
          result.maxFrom = fed.label;
        } else {
          result.max = stored?.max ?? null;
        }
        break;
      case "stack":
        // A stack starts at 0 the moment it is defined.
        result.value = stored?.value ?? 0;
        if (fed) {
          result.max = isFinite(fed.value) ? fed.value : null;
          result.maxFrom = fed.label;
        } else {
          result.max = stored?.max ?? null;
        }
        break;
      case "rack":
        result.rack = stat.rack;
        result.value = stored?.value ?? null;
        result.rackIndex = stored ? stat.rack.indexOf(stored.value) : -1;
        break;
      case "computed": {
        if (!trees.has(id)) {
          const parsed = parseFormula(stat.computedAs);
          trees.set(id, parsed.ok ? parsed.tree : null);
        }
        const tree = trees.get(id);
        if (tree) {
          const computed = evaluateFormula(tree, ({ group, stat: name, part }) => {
            const target = findStat(definition, group, name);
            if (!target) return null;
            const evaluated = evaluate(group, target);
            return part === "value" ? evaluated.value : evaluated[part];
          });
          result.value = Number.isFinite(computed) ? computed : null;
        }
        break;
      }
    }

    visiting.delete(id);
    done.set(id, result);
    return result;
  }

  return definition.groups.map((group) => ({
    name: group.name,
    label: group.label || group.name,
    stats: group.stats.map((stat) => evaluate(group.name, stat)),
  }));
}

/**
 * The values a block starts with when it is added to an element: a pool
 * empty at 0 to 0, a stack at 0, a rack on its first entry, a display at 0.
 * Nothing for a computed stat or a display that is fed, which store
 * nothing.
 */
export function emptyStatBlock(definition: StatBlockDefinition): StatBlock {
  const block: StatBlock = {};
  for (const group of definition.groups) {
    const values: Record<string, StatValue> = {};
    for (const stat of group.stats) {
      const connected = canConnect(stat.type)
        ? resolveConnection(definition, group.name, stat.connectedTo) !== null
        : false;
      switch (stat.type) {
        case "display":
          if (!connected) values[stat.name] = { value: 0 };
          break;
        case "pool":
          values[stat.name] = connected ? { value: 0, min: 0 } : { value: 0, min: 0, max: 0 };
          break;
        case "stack":
          values[stat.name] = { value: 0 };
          break;
        case "rack":
          if (stat.rack.length > 0) values[stat.name] = { value: stat.rack[0] };
          break;
        case "computed":
          break;
      }
    }
    block[group.name] = values;
  }
  return block;
}

/**
 * A value in a form field, as the inputs hold it: a number as its digits, a
 * word as itself, nothing as "".
 */
export function statFieldText(value: number | string | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** One stat's inputs on a form: every part as text, "" for none. */
export type StatFieldValues = { value: string; min: string; max: string };
/** A form's blocks: system key to group to stat to its inputs. */
export type StatBlockFormValues = Record<string, Record<string, Record<string, StatFieldValues>>>;

/**
 * A block as a form's inputs hold it: every stat of the definition with its
 * stored parts as text, read against the definition first so a stale value
 * starts the field empty rather than carrying something the stat no longer
 * holds. The block schema turns the text back into numbers on submit.
 */
export function toStatBlockFields(
  definition: StatBlockDefinition,
  block: StatBlock | undefined,
): Record<string, Record<string, StatFieldValues>> {
  const fields: Record<string, Record<string, StatFieldValues>> = {};
  for (const group of evaluateStatBlock(definition, block)) {
    fields[group.name] = {};
    for (const stat of group.stats) {
      fields[group.name][stat.name] = {
        value: statFieldText(stat.stored?.value),
        min: statFieldText(stat.stored?.min),
        max: statFieldText(stat.stored?.max),
      };
    }
  }
  return fields;
}

const asStored = (text: string): number | string | undefined => {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed;
};

/**
 * A form's inputs as a block, for working the computed stats and fed maxes
 * out while the storyteller types; a field that is not a number yet is left
 * out, so the evaluation shows "—" rather than a guess.
 */
export function statBlockFromFields(
  fields: Record<string, Record<string, Partial<StatFieldValues>>> | undefined,
): StatBlock {
  const block: StatBlock = {};
  for (const [groupName, stats] of Object.entries(fields ?? {})) {
    block[groupName] = {};
    for (const [statName, parts] of Object.entries(stats)) {
      const value = asStored(parts.value ?? "");
      if (value === undefined) continue;
      const stored: StatValue = { value };
      const min = asStored(parts.min ?? "");
      const max = asStored(parts.max ?? "");
      if (typeof min === "number") stored.min = min;
      if (typeof max === "number") stored.max = max;
      block[groupName][statName] = stored;
    }
  }
  return block;
}
