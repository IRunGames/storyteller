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

export type StatGroupDefinition = {
  name: string;
  label: string;
  /**
   * "" for a plain group. The name of one of this group's stats for a group
   * that repeats: an element then carries any number of rows of the group,
   * and that stat's value tells one row from another. Naming the stat is
   * what makes the group repeat, so there is no second flag to keep in step.
   */
  keyedBy: string;
  stats: StatDefinition[];
};
export type StatBlockDefinition = { groups: StatGroupDefinition[] };

/** Whether a group stores rows rather than one record. */
export function isRepeating(group: Pick<StatGroupDefinition, "keyedBy">): boolean {
  return group.keyedBy !== "";
}

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

/** One group's stored values, or one row of a repeating group: stat name to value. */
export type StatRow = Record<string, StatValue>;
/** A plain group stores one row; a repeating group an array of them. */
export type StatBlock = Record<string, StatRow | StatRow[]>;
/** Keyed by id_system as a string, since it is a JSON key. */
export type StatBlocks = Record<string, StatBlock>;

/**
 * A row's key as the text it is compared and addressed by: a number's
 * digits, a word trimmed. Null for nothing usable, which is an empty or
 * blank word, or anything that is not a finite number or a string. Two
 * rows whose keys read the same here are one key, so 6 and "6" collide, as
 * a rack already matches them.
 */
export function rowKeyText(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return null;
}

/**
 * The rows stored for a repeating group: the array when one is there, and
 * none for a plain group or for an object left from before the group
 * repeated.
 */
export function rowsOf(
  group: Pick<StatGroupDefinition, "keyedBy">,
  stored: StatRow | StatRow[] | undefined,
): StatRow[] {
  return isRepeating(group) && Array.isArray(stored) ? stored : [];
}

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

/** One row of a repeating group as shown; key null when the row's key is empty or does not fit. */
export type EvaluatedRow = { key: number | string | null; stats: EvaluatedStat[] };

/**
 * A group as shown. A plain group has its stats and no rows; a repeating
 * group has its rows and no stats. The rows are positional, one per row
 * given, in order: the prep form draws its rows from the evaluation of what
 * is being typed, and a row just added has no key yet while one mid-rename
 * may collide with another, so dropping rows here would leave the form
 * unable to draw them and would put errors keyed by position on the wrong
 * rows. Stale rows are let go once, by tidyStatBlock, when a stored block
 * is read.
 */
export type EvaluatedGroup = {
  name: string;
  label: string;
  keyedBy: string;
  stats: EvaluatedStat[];
  rows: EvaluatedRow[];
};

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

  type Row = { index: number; stored: StatRow };
  const groupOf = (name: string) => definition.groups.find((group) => group.name === name);
  // A plain group's record; nothing when an array was left there by a
  // definition that used to repeat the group.
  const plainStored = (groupName: string): StatRow | undefined => {
    const stored = block?.[groupName];
    return stored !== undefined && !Array.isArray(stored) ? stored : undefined;
  };

  function evaluate(groupName: string, stat: StatDefinition, row?: Row): EvaluatedStat {
    // A row's stats are memoised by the row's position as well, so two rows'
    // computed stats do not share one result.
    const id = row ? `${groupName}[${row.index}].${stat.name}` : `${groupName}.${stat.name}`;
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

    // Where a connection or a formula reference reads from: the same row
    // when it names this row's own group, a plain group's record otherwise.
    // Another repeating group has no one value to read; the definition
    // schema refuses that, and null here keeps the walk safe should such a
    // definition arrive some other way.
    const lookup = (group: string, name: string): EvaluatedStat | null => {
      const target = findStat(definition, group, name);
      const targetGroup = groupOf(group);
      if (!target || !targetGroup) return null;
      if (isRepeating(targetGroup)) {
        return row && group === groupName ? evaluate(group, target, row) : null;
      }
      return evaluate(group, target);
    };

    const connection = canConnect(stat.type)
      ? resolveConnection(definition, groupName, stat.connectedTo)
      : null;
    const fed = connection ? lookup(connection.group, connection.stat) : null;
    const raw = row ? row.stored[stat.name] : plainStored(groupName)?.[stat.name];
    const stored = fitStatValue(stat, connection !== null, raw);
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
        const treeId = `${groupName}.${stat.name}`;
        if (!trees.has(treeId)) {
          const parsed = parseFormula(stat.computedAs);
          trees.set(treeId, parsed.ok ? parsed.tree : null);
        }
        const tree = trees.get(treeId);
        if (tree) {
          const computed = evaluateFormula(tree, ({ group, stat: name, part }) => {
            const evaluated = lookup(group, name);
            if (!evaluated) return null;
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

  return definition.groups.map((group) => {
    const shown = { name: group.name, label: group.label || group.name, keyedBy: group.keyedBy };
    if (!isRepeating(group)) {
      return { ...shown, stats: group.stats.map((stat) => evaluate(group.name, stat)), rows: [] };
    }
    const keyStat = group.stats.find((stat) => stat.name === group.keyedBy);
    const rows = rowsOf(group, block?.[group.name]).map((stored, index) => ({
      key: keyStat ? rowKey(keyStat, stored) : null,
      stats: group.stats.map((stat) => evaluate(group.name, stat, { index, stored })),
    }));
    return { ...shown, stats: [], rows };
  });
}

/** A row's key as stored, when it fits the key stat and reads as something; a word trimmed. */
function rowKey(keyStat: StatDefinition, row: StatRow): number | string | null {
  const fitted = fitStatValue(keyStat, false, row[keyStat.name]);
  if (!fitted || rowKeyText(fitted.value) === null) return null;
  return typeof fitted.value === "string" ? fitted.value.trim() : fitted.value;
}

/**
 * A stored block as far as its definition can use it today, worked out per
 * group: an array under a plain group is nothing stored; an object under a
 * repeating group is no rows; a row whose key is empty or no longer fits
 * the key stat is dropped, and of two rows with one key the first is kept.
 * Run once, where a stored block is read, so the forms and the table only
 * ever see rows with distinct, fitting keys, or rows being typed. A group
 * the definition no longer has is dropped with the rest of what is stale.
 */
export function tidyStatBlock(definition: StatBlockDefinition, block: StatBlock): StatBlock {
  const tidy: StatBlock = {};
  for (const group of definition.groups) {
    const stored = block[group.name];
    if (stored === undefined) continue;
    if (!isRepeating(group)) {
      if (!Array.isArray(stored)) tidy[group.name] = stored;
      continue;
    }
    const keyStat = group.stats.find((stat) => stat.name === group.keyedBy);
    const seen = new Set<string>();
    tidy[group.name] = rowsOf(group, stored).filter((row) => {
      const text = keyStat ? rowKeyText(rowKey(keyStat, row)) : null;
      if (text === null || seen.has(text)) return false;
      seen.add(text);
      return true;
    });
  }
  return tidy;
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
    // A repeating group starts with no rows; the storyteller adds them.
    if (isRepeating(group)) {
      block[group.name] = [];
      continue;
    }
    const values: StatRow = {};
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
/** One group's inputs, or one row's: stat name to its parts. */
export type StatRowFieldValues = Record<string, StatFieldValues>;
/** A form's blocks: system key to group to its inputs, or to its rows' inputs when the group repeats. */
export type StatBlockFormValues = Record<
  string,
  Record<string, StatRowFieldValues | StatRowFieldValues[]>
>;

/** One stat's parts as text, from what is stored for it. */
function statFields(stored: StatValue | null): StatFieldValues {
  return {
    value: statFieldText(stored?.value),
    min: statFieldText(stored?.min),
    max: statFieldText(stored?.max),
  };
}

/**
 * The inputs of a row being added to a repeating group: every field empty,
 * but a rack on its first entry, since a select with nothing chosen would
 * show its first option while posting nothing.
 */
export function emptyStatRowFields(group: StatGroupDefinition): StatRowFieldValues {
  const fields: StatRowFieldValues = {};
  for (const stat of group.stats) {
    fields[stat.name] = {
      value: stat.type === "rack" && stat.rack.length > 0 ? String(stat.rack[0]) : "",
      min: "",
      max: "",
    };
  }
  return fields;
}

/**
 * A block as a form's inputs hold it: every stat of the definition with its
 * stored parts as text, read against the definition first so a stale value
 * starts the field empty rather than carrying something the stat no longer
 * holds. The block schema turns the text back into numbers on submit.
 */
export function toStatBlockFields(
  definition: StatBlockDefinition,
  block: StatBlock | undefined,
): Record<string, StatRowFieldValues | StatRowFieldValues[]> {
  const fields: Record<string, StatRowFieldValues | StatRowFieldValues[]> = {};
  const rowFields = (stats: EvaluatedStat[]): StatRowFieldValues =>
    Object.fromEntries(stats.map((stat) => [stat.name, statFields(stat.stored)]));
  const tidy = block ? tidyStatBlock(definition, block) : undefined;
  for (const group of evaluateStatBlock(definition, tidy)) {
    fields[group.name] = isRepeating(group)
      ? group.rows.map((row) => rowFields(row.stats))
      : rowFields(group.stats);
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
type PartialRowFields = Record<string, Partial<StatFieldValues>>;

export function statBlockFromFields(
  fields: Record<string, PartialRowFields | PartialRowFields[]> | undefined,
): StatBlock {
  const rowFromFields = (stats: PartialRowFields): StatRow => {
    const row: StatRow = {};
    for (const [statName, parts] of Object.entries(stats)) {
      const value = asStored(parts.value ?? "");
      if (value === undefined) continue;
      const stored: StatValue = { value };
      const min = asStored(parts.min ?? "");
      const max = asStored(parts.max ?? "");
      if (typeof min === "number") stored.min = min;
      if (typeof max === "number") stored.max = max;
      row[statName] = stored;
    }
    return row;
  };
  const block: StatBlock = {};
  for (const [groupName, stats] of Object.entries(fields ?? {})) {
    block[groupName] = Array.isArray(stats) ? stats.map(rowFromFields) : rowFromFields(stats);
  }
  return block;
}
