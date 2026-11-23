// Stat blocks: what a game system says an element can carry (its
// definition, on systems.stat_block_definition) and what one element does
// carry (its block, on elements.stat_blocks). GLOSSARY.md has the words. No
// React and no zod here: the shapes, how a block is read against its
// definition, and how a stat's shown value is worked out, for the server
// actions, the forms and the table alike. The zod schemas that check the
// shapes are in stat-block-schemas.ts.
import type { z } from "zod";
import { normalizeDice } from "./roll";
import type { statDefinitionSchema, statGroupDefinitionSchema } from "./stat-block-schemas";
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
 * Text that reads as a number: an optional sign, digits, and an optional
 * decimal part, which is what a stat's box or a rack entry may hold for a
 * number. The one rule for the four places text is read back as a value.
 */
export const NUMBER_TEXT = /^-?\d+(\.\d+)?$/;

/** The text as a number when it reads as one (NUMBER_TEXT), else as it is. */
export function numberOrText(text: string): number | string {
  return NUMBER_TEXT.test(text) ? Number(text) : text;
}

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
    .map(numberOrText);
}

/** A rack as the editor's field shows it. */
export function joinRack(rack: RackEntry[]): string {
  return rack.map(String).join(", ");
}

/**
 * One stat of a definition, as statDefinitionSchema (stat-block-schemas.ts)
 * checks it; every field is present, an empty string or array standing for
 * "none", so the editor's rows and the stored jsonb are one shape. The
 * fields are documented on the schema, which is the one place they are
 * declared; the type is read off it so the two cannot drift apart. A type
 * import only, so no zod reaches this module at run time.
 */
export type StatDefinition = z.infer<typeof statDefinitionSchema>;

/** The rolls the template editor offers before a custom one. */
export const ROLL_PRESETS = ["1d6", "2d6", "1d8", "1d10", "1d12", "1d20"] as const;

/** One group of a definition, as statGroupDefinitionSchema checks it; see StatDefinition. */
export type StatGroupDefinition = z.infer<typeof statGroupDefinitionSchema>;

export type StatBlockDefinition = {
  groups: StatGroupDefinition[];
  /**
   * When the definition was last saved, as an ISO timestamp: stamped by every
   * action that writes one (stampDefinition), so a story's copy and its
   * system's can be compared by age. Absent on a definition last saved
   * before the stamp was kept.
   */
  updatedAt?: string;
  /**
   * The template's health indicator, as "group.stat": a pool or a stack held
   * to a number, in a group that does not repeat, whose level each pill
   * carrying it shows as a drop by its name (healthLevel). "" or absent for
   * none; absent on a template saved before there was one.
   */
  healthIndicator?: string;
};

/** The definition as a save writes it, stamped with the moment of the save. */
export function stampDefinition(definition: StatBlockDefinition): StatBlockDefinition {
  return { ...definition, updatedAt: new Date().toISOString() };
}

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

/**
 * The Dice stat a stat is initialized from (initialFrom), with its group;
 * null for a stat initialized from none, or from a stat the definition no
 * longer has as a Dice stat it can read: one in a plain group for a stat in
 * a plain group, and one of its own group, the same row, for a stat in a
 * group that repeats.
 */
export function initialSource(
  definition: StatBlockDefinition,
  groupName: string,
  stat: Pick<StatDefinition, "initialFrom">,
): { group: StatGroupDefinition; stat: StatDefinition } | null {
  if (stat.initialFrom === "") return null;
  const [sourceGroupName, sourceName] = stat.initialFrom.split(".");
  const group = definition.groups.find((candidate) => candidate.name === groupName);
  const sourceGroup = definition.groups.find((candidate) => candidate.name === sourceGroupName);
  const source = sourceGroup?.stats.find((candidate) => candidate.name === sourceName);
  if (!group || !sourceGroup || !source || source.type !== "dice") return null;
  const readable = isRepeating(group) ? sourceGroup.name === group.name : !isRepeating(sourceGroup);
  return readable ? { group: sourceGroup, stat: source } : null;
}

/**
 * What a stat starts at, in words: its Initialized as roll ("8d8+3"), "a
 * roll of Hit Dice" for one initialized from a Dice stat, or "" for
 * neither. The template's summaries say it after "starts at".
 */
export function initializedAs(
  definition: StatBlockDefinition,
  groupName: string,
  stat: Pick<StatDefinition, "initialRoll" | "initialFrom">,
): string {
  const source = initialSource(definition, groupName, stat);
  return source ? `a roll of ${statLabel(source.stat)}` : stat.initialRoll;
}

/** The key a system's block is stored under. */
export function systemKey(idSystem: number): string {
  return String(idSystem);
}

/**
 * The stat the template names as its health indicator, with its group: null
 * for none, or for a name the template no longer has as a pool or a stack held
 * to a number in a group that does not repeat.
 */
export function healthIndicatorOf(
  definition: StatBlockDefinition,
): { group: StatGroupDefinition; stat: StatDefinition } | null {
  const named = definition.healthIndicator ?? "";
  if (named === "") return null;
  const [groupName, statName] = named.split(".");
  const group = findGroup(definition, groupName);
  const stat = group?.stats.find((candidate) => candidate.name === statName);
  if (!group || !stat || isRepeating(group)) return null;
  if (stat.type !== "pool" && stat.type !== "stack") return null;
  return isNumberFormat(stat.format) ? { group, stat } : null;
}

/**
 * How full a holder's health indicator is, for its drop: the stat's value
 * over its max as a whole percent, 0 at or below 0 and 100 at or above the
 * max, whatever a pool's min. Read from the holder's block of the template's
 * system. Null when there is nothing to show: no template, no indicator, the
 * group not carried, the value blank, or no max above 0.
 */
export function healthLevel(
  template: Pick<StatBlockSystem, "idSystem" | "definition"> | null,
  blocks: StatBlocks,
): number | null {
  if (template === null) return null;
  const indicator = healthIndicatorOf(template.definition);
  if (indicator === null) return null;
  const stored = blocks[systemKey(template.idSystem)]?.[indicator.group.name];
  if (stored === undefined || Array.isArray(stored)) return null;
  const fitted = fitStatValue(indicator.stat, stored[indicator.stat.name]);
  if (typeof fitted?.value !== "number" || fitted.max === undefined || fitted.max <= 0) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round((fitted.value / fitted.max) * 100)));
}

/** Whether a definition has anything to draw. */
export function hasStats(definition: StatBlockDefinition): boolean {
  return definition.groups.some((group) => group.stats.length > 0);
}

/** One group of a definition by name, or undefined. */
export function findGroup(
  definition: StatBlockDefinition,
  groupName: string,
): StatGroupDefinition | undefined {
  return definition.groups.find((group) => group.name === groupName);
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
 * 8d8+3", or "Hit Points: a roll of Hit Dice" for one initialized from a
 * Dice stat), what it is initialized as alone without a description, or ""
 * for neither.
 */
export function statTooltip(
  stat: Pick<StatDefinition, "description" | "initialRoll"> & { initialFromLabel?: string },
): string {
  const initialized = stat.initialFromLabel
    ? `a roll of ${stat.initialFromLabel}`
    : stat.initialRoll;
  if (initialized === "") return stat.description;
  return stat.description === "" ? initialized : `${stat.description}: ${initialized}`;
}

/** One stat as the block shows it, with what the controls need beside the value. */
export type EvaluatedStat = {
  name: string;
  label: string;
  /** As the definition says; "" for none. */
  description: string;
  /** As the definition says; "" for none. */
  initialRoll: string;
  /** The label of the Dice stat it is initialized from (initialSource); "" for none. */
  initialFromLabel: string;
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
  /** As the definition says. */
  leftRight: boolean;
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
  const sourceLabel = (groupName: string, stat: StatDefinition): string => {
    const source = initialSource(definition, groupName, stat);
    return source ? statLabel(source.stat) : "";
  };
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
      initialFromLabel: sourceLabel(groupName, stat),
      type: stat.type,
      visible: stat.visible,
      format: stat.format,
      sticky: stat.sticky,
      static: stat.static,
      roll: stat.roll,
      global: stat.global,
      upDown: stat.upDown,
      leftRight: stat.leftRight,
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

/**
 * A stat's starting number: its Initialized as rolled, or the dice its
 * source holds (`sourceDice`, for a stat initialized from a Dice stat)
 * rolled, when there is something to roll and a roller is given; 0
 * otherwise, which is also how a stat whose source is still blank starts,
 * empty, for the form to roll once the dice are typed.
 */
function startingNumber(
  stat: StatDefinition,
  roll: InitialRoller | undefined,
  sourceDice?: string,
): number {
  if (!roll || !canRoll(stat)) return 0;
  const notation = stat.initialFrom !== "" ? (sourceDice ?? "") : stat.initialRoll;
  if (notation === "") return 0;
  return roll(notation) ?? 0;
}

/**
 * The values one group starts with when it is picked for an element: a pool
 * full at its Initialized as roll, or empty at 0 to 0 without one; a stack
 * at its roll with the roll as its max, or at 0; a rack on its first entry;
 * a display at its roll, or 0. Nothing for a computed stat, which stores
 * nothing. A repeating group starts with no rows; the storyteller adds them
 * (emptyStatRowFields). Without a roller every roll reads as 0. A stat
 * initialized from a Dice stat rolls the dice that stat holds in `block`,
 * the holder's blocks as they are, so a Hit Dice already filled in another
 * group is rolled for the Hit Points added after it; a source in this same
 * group is blank as the group is added, so its stats start empty.
 */
export function emptyStatGroup(
  definition: StatBlockDefinition,
  group: StatGroupDefinition,
  roll?: InitialRoller,
  block?: StatBlock,
): StatRow | StatRow[] {
  if (isRepeating(group)) return [];
  const values: StatRow = {};
  for (const stat of group.stats) {
    const source = initialSource(definition, group.name, stat);
    const held = source && source.group.name !== group.name ? block?.[source.group.name] : null;
    const sourceDice =
      held && !Array.isArray(held) ? String(held[source!.stat.name]?.value ?? "") : undefined;
    const value = startingValue(stat, startingNumber(stat, roll, sourceDice));
    if (value !== undefined) values[stat.name] = value;
  }
  return values;
}

/**
 * What one stat stores as it starts, given its starting number: a pool full
 * at it, 0 to it; a stack at it with it as the max, or bare at 0; a rack on
 * its first entry, or nothing for a rack with none; a display at it; a dice
 * stat empty, to be typed; nothing for a computed stat, which stores
 * nothing. The one rule for a group picked for an element and a row added
 * to one (emptyStatRowFields).
 */
export function startingValue(stat: StatDefinition, start: number): StatValue | undefined {
  switch (stat.type) {
    case "display":
      return { value: start };
    case "pool":
      return { value: start, min: 0, max: start };
    case "stack":
      return start === 0 ? { value: 0 } : { value: start, max: start };
    case "rack":
      return stat.rack.length > 0 ? { value: stat.rack[0] } : undefined;
    case "dice":
      return {};
    case "computed":
      return undefined;
  }
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
 * Where a stat starts once its Initialized as is rolled to `total`: a pool
 * full at it with it as its max, keeping the floor it had; a stack at it
 * with it as its max, or at 0 with none; a display at it. As emptyStatGroup
 * starts them.
 */
function startedAt(stat: StatDefinition, total: number, current: StatValue | undefined): StatValue {
  switch (stat.type) {
    case "pool":
      return { value: total, min: current?.min ?? 0, max: total };
    case "stack":
      return total === 0 ? { value: 0 } : { value: total, max: total };
    default:
      return { value: total };
  }
}

/**
 * One system's block with every stat that has an Initialized as rolled
 * afresh, as an element's blocks are when the element is added to a scene,
 * so each scene element plays its own roll rather than the one made for the
 * element, every copy of a goblin among them. A stat initialized from a
 * Dice stat rolls the dice the block holds there (initialSource), its own
 * row's in a group that repeats; one with dice of its own rolls those, and
 * is rolled into the group even where the block stored nothing for it. A
 * stat with nothing it can roll (its Dice stat blank or unreadable, or a
 * roll the roller cannot make) keeps the value it has, as does everything
 * the definition does not roll, groups it does not know included.
 */
export function rollStartingStats(
  definition: StatBlockDefinition,
  block: StatBlock,
  roll: InitialRoller,
): StatBlock {
  const rolled: StatBlock = { ...block };
  for (const group of definition.groups) {
    const held = block[group.name];
    if (held === undefined) continue;
    const rollRow = (row: StatRow): StatRow => {
      const next: StatRow = { ...row };
      for (const stat of group.stats) {
        if (!canRoll(stat)) continue;
        let notation = stat.initialRoll;
        if (stat.initialFrom !== "") {
          const source = initialSource(definition, group.name, stat);
          if (!source) continue;
          // Its own group's Dice stat is in this row; another group's is
          // that plain group's one record.
          const holder = source.group.name === group.name ? row : block[source.group.name];
          const dice = holder && !Array.isArray(holder) ? holder[source.stat.name]?.value : null;
          notation = typeof dice === "string" ? dice : "";
        }
        if (notation === "") continue;
        const total = roll(notation);
        if (total !== null) next[stat.name] = startedAt(stat, total, row[stat.name]);
      }
      return next;
    };
    rolled[group.name] = Array.isArray(held) ? held.map(rollRow) : rollRow(held);
  }
  return rolled;
}

/** Every system's block rolled as rollStartingStats rolls one; a block of a system not given is kept as it is. */
export function rollStartingBlocks(
  systems: StatBlockSystem[],
  blocks: StatBlocks,
  roll: InitialRoller,
): StatBlocks {
  return Object.fromEntries(
    Object.entries(blocks).map(([key, block]) => {
      const system = systems.find((candidate) => systemKey(candidate.idSystem) === key);
      return [key, system ? rollStartingStats(system.definition, block, roll) : block];
    }),
  );
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
 * roller is given. A stat initialized from a Dice stat reads that stat in
 * its own row, still blank here, so it starts empty for the form to roll
 * once the dice are typed. In a group that can have multiples, the row's
 * multiple starts at 1.
 */
export function emptyStatRowFields(
  group: StatGroupDefinition,
  roll?: InitialRoller,
): StatRowFieldValues {
  const fields: StatRowFieldValues = {};
  for (const stat of group.stats) {
    const start = startingNumber(stat, roll);
    const rolled = roll !== undefined && stat.initialRoll !== "" && canRoll(stat);
    // A rack starts on its entry whether or not anything rolled; a number
    // only when the roller gave it one.
    const starting = stat.type === "rack" || rolled ? startingValue(stat, start) : undefined;
    fields[stat.name] = {
      value: starting?.value === undefined ? "" : String(starting.value),
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
  return trimmed === "" ? undefined : numberOrText(trimmed);
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
