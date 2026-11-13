// Stat blocks: what a game system says an element can carry (its
// definition, on systems.stat_block_definition) and what one element does
// carry (its block, on elements.stat_blocks). GLOSSARY.md has the words. No
// React and no zod here: the shapes, how a block is read against its
// definition, and how a stat's shown value is worked out, for the server
// actions, the forms and the table alike. The zod schemas that check the
// shapes are in stat-block-schemas.ts.
import { normalizeDice } from "./roll";
import { evaluateFormula, parseFormula, type FormulaNode } from "./stat-formula";

export const STAT_TYPES = ["display", "pool", "stack", "rack", "dice", "computed"] as const;
export type StatType = (typeof STAT_TYPES)[number];

/**
 * How a stat's value is held and written: "" as it is, a number or a word;
 * "number" a number only, which the prep form holds the value to; "number
 * +/-" a number only, written with its sign at the table ("+3", "−2") for a
 * bonus or a penalty. Offered on a display, a pool and a stack; a pool and a
 * stack start as "number" (defaultFormat).
 */
export const STAT_FORMATS = ["", "number", "number +/-"] as const;
export type StatFormat = (typeof STAT_FORMATS)[number];

export const STAT_FORMAT_LABELS: Record<StatFormat, string> = {
  "": "<none>",
  number: "number",
  "number +/-": "number +/-",
};

/** Whether the format writes the number with its sign. */
export function isSignedFormat(format: StatFormat): boolean {
  return format === "number +/-";
}

/** The format a stat starts with: a pool or a stack holds numbers, so "number"; else as it is. */
export function defaultFormat(type: StatType): StatFormat {
  return type === "pool" || type === "stack" ? "number" : "";
}

/** Whether the format holds the stat's value to a number. */
export function isNumberFormat(format: StatFormat): boolean {
  return format !== "";
}

/** Whether a stat of this type is offered a format at all; the rest hold "". */
export function hasFormat(type: StatType): boolean {
  return type === "display" || type === "pool" || type === "stack";
}

/**
 * Whether a stat may carry a roll: a pool or a stack always, a display once
 * it is held to a number (a bonus to add to the dice). Any other stat's roll
 * is "".
 */
export function canRoll(stat: Pick<StatDefinition, "type" | "format">): boolean {
  return (
    stat.type === "pool" ||
    stat.type === "stack" ||
    (stat.type === "display" && isNumberFormat(stat.format))
  );
}

/**
 * Whether the table has a die to press for the stat: a dice stat rolls
 * what it holds, and a stat that may carry a roll (canRoll) rolls that.
 */
export function hasDie(stat: Pick<StatDefinition, "type" | "format">): boolean {
  return stat.type === "dice" || canRoll(stat);
}

export const STAT_TYPE_LABELS: Record<StatType, string> = {
  display: "Display",
  pool: "Pool",
  stack: "Stack",
  rack: "Rack",
  dice: "Dice",
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
  /** What the stat is for, a hover away on the form and at the table; "" for none. */
  description: string;
  type: StatType;
  /** A rack's entries in order; [] for any other type. */
  rack: RackEntry[];
  /** A computed stat's formula (stat-formula.ts); "" for any other type. */
  computedAs: string;
  /**
   * Whether the table draws the stat. A hidden stat is still filled in on
   * the prep form and still feeds formulas, so a system can keep a formula's
   * working out of the element panel.
   */
  visible: boolean;
  /** How the value is held and written (STAT_FORMATS); "" for as it is. */
  format: StatFormat;
  /** The stat shares a line with the stat after it, on the form and at the table (statLines). */
  sticky: boolean;
  /**
   * Shown at the table as words rather than in a box with a clicker: for a
   * modifier set on the prep form and not nudged in play.
   */
  static: boolean;
  /**
   * The roll that goes with a pool, a stack or a display held to a number,
   * as the chat's /roll takes it ("2d6+1"); "" for none, and always "" on
   * any other stat (canRoll). One of ROLL_PRESETS or anything the roller
   * reads.
   */
  roll: string;
  /**
   * Whether the table's stats pane offers to roll the stat for every element
   * in the scene at once, as an initiative is rolled. Only a stat the table
   * can roll (hasDie) may be global.
   */
  global: boolean;
  /**
   * Whether an editable number at the table has the up/down clicker beside
   * its box (StatNumber); without it the box alone is drawn. Only a stat
   * held to a number format has one to show, so on any other it is idle.
   */
  upDown: boolean;
  /**
   * The dice rolled once when the stat's block is added to an element
   * ("2d6", "8d8+3"), for its starting value and, on a pool or a stack, its
   * max; "" for a stat that starts at 0. Only a pool, a stack or a display
   * held to a number may have one (canRoll).
   */
  initialRoll: string;
};

/** The rolls the template editor offers before a custom one. */
export const ROLL_PRESETS = ["1d6", "2d6", "1d8", "1d10", "1d12", "1d20"] as const;

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
  /**
   * Whether the table draws a die on the group's heading that rolls the
   * first die of every row at once (sa_rollGroupRows). Only a group that
   * repeats may.
   */
  rollAll: boolean;
  /**
   * Whether each row of this group says how many of it the element has (its
   * multiple, MULTIPLE in the row, 1 unless set): Palladium's attacks per
   * melee with each weapon. Roll all then rolls each row that many times.
   * Only a group that repeats may.
   */
  canHaveMultiples: boolean;
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
  /** Absent when the box was left blank: nothing to show yet. */
  value?: number | string;
  /** Pool only; 0 when absent. */
  min?: number;
  /** Pool and stack; absent on a stack when unbounded. */
  max?: number;
};

/** One group's stored values, or one row of a repeating group: stat name to value. */
export type StatRow = Record<string, StatValue>;
/**
 * A plain group stores one row; a repeating group an array of them. A row
 * of a group that can have multiples holds how many of it the element has
 * under MULTIPLE, beside its stats.
 */
export type StatBlock = Record<string, StatRow | StatRow[]>;

/**
 * A row's key for its multiple, `{ value: n }`. A stat name is an
 * identifier, so the dollar keeps it from ever colliding with one.
 */
export const MULTIPLE = "$multiple";

/** How many of its group a row stands for: its multiple as stored, a whole number of 1 or more; 1 otherwise. */
export function multipleOf(row: StatRow | undefined): number {
  const value = row?.[MULTIPLE]?.value;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : 1;
}
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

/**
 * A stat's value as the table writes it: a dash for nothing to show, which
 * a word under a number format is too, a number with its sign under a
 * signed format, else as it is.
 */
export function formatStatValue(stat: Pick<EvaluatedStat, "value" | "format">): string {
  if (stat.value === null) return "—";
  // A word where a number format wants a number (stored before the format
  // was set) is nothing to show, as the form's box starts empty for it.
  if (isNumberFormat(stat.format) && typeof stat.value !== "number") return "—";
  if (isSignedFormat(stat.format) && typeof stat.value === "number") {
    return `${stat.value < 0 ? "−" : "+"}${Math.abs(stat.value)}`;
  }
  return String(stat.value);
}

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
 * the value was written (a type changed, a rack shrunk), and a value that
 * no longer fits reads as absent rather
 * than refusing the whole block, so nothing the storyteller did not touch
 * ever stands in their way. The next save of the block drops it.
 */
export function fitStatValue(stat: StatDefinition, raw: unknown): StatValue | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { value, min, max } = raw as Record<string, unknown>;
  switch (stat.type) {
    case "display":
      if (value === undefined) return {};
      if (isFinite(value)) return { value };
      if (typeof value === "string" && value.length <= 200) return { value };
      return null;
    case "pool": {
      if (value !== undefined && !isFinite(value)) return null;
      const fitted: StatValue = { min: isFinite(min) ? min : 0 };
      if (isFinite(value)) fitted.value = value;
      if (isFinite(max)) fitted.max = max;
      return fitted;
    }
    case "stack": {
      if (value !== undefined && !isFinite(value)) return null;
      const fitted: StatValue = {};
      if (isFinite(value)) fitted.value = value;
      if (isFinite(max)) fitted.max = max;
      return fitted;
    }
    case "rack": {
      const entry = matchRackEntry(stat.rack, value);
      return entry === null ? null : { value: entry };
    }
    case "dice": {
      // Blank, or "" from before blanks were left out, is a dice stat with
      // nothing yet; anything else must read as dice.
      if (value === undefined || value === "") return {};
      const dice = typeof value === "string" ? normalizeDice(value) : null;
      return dice === null ? null : { value: dice };
    }
    case "computed":
      return null;
  }
}

/**
 * What a stat's label says on hover, on the prep form and at the table: its
 * description, with what it is initialized as after a colon ("Hit Points:
 * 8d8+3"), the roll alone without a description, or "" for neither.
 */
export function statTooltip(stat: Pick<StatDefinition, "description" | "initialRoll">): string {
  if (stat.initialRoll === "") return stat.description;
  return stat.description === "" ? stat.initialRoll : `${stat.description}: ${stat.initialRoll}`;
}

/** One stat as the block shows it, with what the controls need beside the value. */
export type EvaluatedStat = {
  name: string;
  label: string;
  /** As the definition says; "" for none. */
  description: string;
  /** As the definition says; "" for none. */
  initialRoll: string;
  type: StatType;
  /** As the definition says; the table leaves a hidden stat out. */
  visible: boolean;
  /** As the definition says. */
  format: StatFormat;
  /** As the definition says. */
  sticky: boolean;
  /** As the definition says. */
  static: boolean;
  /** As the definition says; "" for none. */
  roll: string;
  /** As the definition says. */
  global: boolean;
  /** As the definition says. */
  upDown: boolean;
  /** The current value; null for nothing to show (unset, a formula that is not a number, a rack entry gone). */
  value: number | string | null;
  /** A pool's floor. */
  min?: number;
  /** A pool's or stack's ceiling; null for a stack with none. */
  max?: number | null;
  /** A rack's entries, for the ◀ ▶ and the select, and where the value sits in them. */
  rack?: RackEntry[];
  rackIndex?: number;
  /** What the element stores for it, as far as it fits; null for a computed or fed display. */
  stored: StatValue | null;
};

/**
 * One row of a repeating group as shown; key null when the row's key is
 * empty or does not fit. `multiple` is how many of the group the row stands
 * for (multipleOf), 1 where the group cannot have more.
 */
export type EvaluatedRow = {
  key: number | string | null;
  multiple: number;
  stats: EvaluatedStat[];
};

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
  /** As the definition says: the heading offers to roll every row's first die at once. */
  rollAll: boolean;
  /** As the definition says: each row may say how many of the group the element has. */
  canHaveMultiples: boolean;
  stats: EvaluatedStat[];
  rows: EvaluatedRow[];
};

/**
 * A block worked out against its definition: every group and stat in the
 * definition's order, each with the value to show and, by type, its min,
 * max and rack. A computed stat comes from its formula over the others,
 * memoised so a stat read
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
      description: stat.description,
      initialRoll: stat.initialRoll,
      type: stat.type,
      visible: stat.visible,
      format: stat.format,
      sticky: stat.sticky,
      static: stat.static,
      roll: stat.roll,
      global: stat.global,
      upDown: stat.upDown,
      value: null,
      stored: null,
    };
    if (visiting.has(id)) return base;
    visiting.add(id);

    // Where a formula reference reads from: the same row when it names this
    // row's own group, a plain group's record otherwise.
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

    const raw = row ? row.stored[stat.name] : plainStored(groupName)?.[stat.name];
    const stored = fitStatValue(stat, raw);
    const result: EvaluatedStat = { ...base, stored };

    switch (stat.type) {
      case "display":
        result.value = stored?.value ?? null;
        break;
      case "pool":
        result.value = stored?.value ?? null;
        result.min = stored?.min ?? 0;
        result.max = stored?.max ?? null;
        break;
      case "stack":
        // A stack starts at 0 the moment it is defined.
        result.value = stored?.value ?? 0;
        result.max = stored?.max ?? null;
        break;
      case "rack":
        result.rack = stat.rack;
        result.value = stored?.value ?? null;
        result.rackIndex = stored?.value === undefined ? -1 : stat.rack.indexOf(stored.value);
        break;
      case "dice":
        result.value = stored?.value ?? null;
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
    const shown = {
      name: group.name,
      label: group.label || group.name,
      keyedBy: group.keyedBy,
      rollAll: group.rollAll,
      canHaveMultiples: group.canHaveMultiples,
    };
    if (!isRepeating(group)) {
      return { ...shown, stats: group.stats.map((stat) => evaluate(group.name, stat)), rows: [] };
    }
    const keyStat = group.stats.find((stat) => stat.name === group.keyedBy);
    const rows = rowsOf(group, block?.[group.name]).map((stored, index) => ({
      key: keyStat ? rowKey(keyStat, stored) : null,
      multiple: group.canHaveMultiples ? multipleOf(stored) : 1,
      stats: group.stats.map((stat) => evaluate(group.name, stat, { index, stored })),
    }));
    return { ...shown, stats: [], rows };
  });
}

/** A row's key as stored, when it fits the key stat and reads as something; a word trimmed. */
function rowKey(keyStat: StatDefinition, row: StatRow): number | string | null {
  const fitted = fitStatValue(keyStat, row[keyStat.name]);
  if (!fitted || fitted.value === undefined || rowKeyText(fitted.value) === null) return null;
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
    tidy[group.name] = rowsOf(group, stored)
      .filter((row) => {
        const text = keyStat ? rowKeyText(rowKey(keyStat, row)) : null;
        if (text === null || seen.has(text)) return false;
        seen.add(text);
        return true;
      })
      // A row's multiple is stale once the group can no longer have one.
      .map((row) => {
        if (group.canHaveMultiples || !(MULTIPLE in row)) return row;
        const { [MULTIPLE]: _gone, ...rest } = row;
        return rest;
      });
  }
  return tidy;
}

/**
 * Rolls a stat's Initialized as (`initialRoll`): the total, or null for
 * nothing rolled. The library's roller at the table and on the prep form
 * (rollTotal in lib/dice.ts); a test's gives what it likes.
 */
export type InitialRoller = (notation: string) => number | null;

/** A stat's starting number: its Initialized as rolled, when it has one and a roller is given; 0 otherwise. */
function startingNumber(stat: StatDefinition, roll: InitialRoller | undefined): number {
  if (!roll || stat.initialRoll === "" || !canRoll(stat)) return 0;
  return roll(stat.initialRoll) ?? 0;
}

/**
 * The values one group starts with when it is picked for an element: a pool
 * full at its Initialized as roll, or empty at 0 to 0 without one; a stack
 * at its roll with the roll as its max, or at 0; a rack on its first entry;
 * a display at its roll, or 0. Nothing for a computed stat, which stores
 * nothing. A repeating group starts with no rows; the storyteller adds them
 * (emptyStatRowFields). Without a roller every roll reads as 0. The
 * definition is taken for the callers' sake and not read.
 */
export function emptyStatGroup(
  _definition: StatBlockDefinition,
  group: StatGroupDefinition,
  roll?: InitialRoller,
): StatRow | StatRow[] {
  if (isRepeating(group)) return [];
  const values: StatRow = {};
  for (const stat of group.stats) {
    const start = startingNumber(stat, roll);
    switch (stat.type) {
      case "display":
        values[stat.name] = { value: start };
        break;
      case "pool":
        values[stat.name] = { value: start, min: 0, max: start };
        break;
      case "stack":
        values[stat.name] = start === 0 ? { value: 0 } : { value: start, max: start };
        break;
      case "rack":
        if (stat.rack.length > 0) values[stat.name] = { value: stat.rack[0] };
        break;
      case "dice":
        values[stat.name] = {};
        break;
      case "computed":
        break;
    }
  }
  return values;
}

/** Every group of the template picked at once, each as emptyStatGroup starts it. */
export function emptyStatBlock(definition: StatBlockDefinition, roll?: InitialRoller): StatBlock {
  const block: StatBlock = {};
  for (const group of definition.groups) {
    block[group.name] = emptyStatGroup(definition, group, roll);
  }
  return block;
}

/**
 * The template's groups an element carries: those present in its block, in
 * the template's order. A group the template no longer has is not drawn,
 * as tidyStatBlock drops it; one the template has but the block does not is
 * what the picker offers.
 */
export function carriedGroups(
  definition: StatBlockDefinition,
  block: StatBlock | undefined,
): StatGroupDefinition[] {
  if (!block) return [];
  return definition.groups.filter((group) => group.name in block);
}

/**
 * The stats of a block as the lines they are drawn on: a stat marked
 * sticky shares its line with the stat after it, so a run of sticky stats
 * and the one that follows them are one line. A sticky stat at the end has
 * nothing to stick to and is a line of its own. Every stat is on exactly one
 * line, in order; the form and the display block both draw from this.
 */
export function statLines<T extends { sticky: boolean }>(stats: T[]): T[][] {
  const lines: T[][] = [];
  let line: T[] = [];
  for (const stat of stats) {
    line.push(stat);
    if (!stat.sticky) {
      lines.push(line);
      line = [];
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/**
 * A text as a number-only box keeps it: digits, one leading minus and one
 * decimal point, anything else dropped as it is typed or pasted. "-" and
 * "1." are kept as they are on the way to a number; the schema says
 * "Enter a number." if they are left so.
 */
export function numberOnly(text: string): string {
  let out = "";
  let point = false;
  for (const char of text) {
    if (char >= "0" && char <= "9") out += char;
    else if (char === "-" && out === "") out = "-";
    else if (char === "." && !point) {
      point = true;
      out += char;
    }
  }
  return out;
}

/** The sign a "number +/-" stat shows beside its number: a true minus below zero, else a plus. */
export function signOf(value: number): "+" | "−" {
  return value < 0 ? "−" : "+";
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
 * show its first option while posting nothing, and a stat with an
 * Initialized as at its roll, a pool's or stack's max with it, when a
 * roller is given. In a group that can have multiples, the row's multiple
 * starts at 1.
 */
export function emptyStatRowFields(
  group: StatGroupDefinition,
  roll?: InitialRoller,
): StatRowFieldValues {
  const fields: StatRowFieldValues = {};
  for (const stat of group.stats) {
    const start = startingNumber(stat, roll);
    const rolled = roll !== undefined && stat.initialRoll !== "" && canRoll(stat);
    fields[stat.name] = {
      value:
        stat.type === "rack" && stat.rack.length > 0
          ? String(stat.rack[0])
          : rolled
            ? String(start)
            : "",
      min: "",
      max: rolled && (stat.type === "pool" || stat.type === "stack") ? String(start) : "",
    };
  }
  if (group.canHaveMultiples) fields[MULTIPLE] = { value: "1", min: "", max: "" };
  return fields;
}

/**
 * A block as a form's inputs hold it: every stat of the definition with its
 * stored parts as text, read against the definition first so a stale value
 * starts the field empty rather than carrying something the stat no longer
 * holds. The block schema turns the text back into numbers on submit. A
 * row of a group that can have multiples carries its multiple under
 * MULTIPLE beside its stats, 1 where none is stored.
 */
export function toStatBlockFields(
  definition: StatBlockDefinition,
  block: StatBlock | undefined,
): Record<string, StatRowFieldValues | StatRowFieldValues[]> {
  const fields: Record<string, StatRowFieldValues | StatRowFieldValues[]> = {};
  const rowFields = (stats: EvaluatedStat[]): StatRowFieldValues =>
    Object.fromEntries(stats.map((stat) => [stat.name, statFields(stat.stored)]));
  const tidy = block ? tidyStatBlock(definition, block) : undefined;
  // Only the groups the block carries: the rest are the picker's to offer.
  const carried = new Set(carriedGroups(definition, tidy).map((group) => group.name));
  for (const group of evaluateStatBlock(definition, tidy)) {
    if (!carried.has(group.name)) continue;
    fields[group.name] = isRepeating(group)
      ? group.rows.map((row) => ({
          ...rowFields(row.stats),
          ...(group.canHaveMultiples
            ? { [MULTIPLE]: { value: String(row.multiple), min: "", max: "" } }
            : {}),
        }))
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
