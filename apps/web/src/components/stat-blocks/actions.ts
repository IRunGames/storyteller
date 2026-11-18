"use server";

import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { idSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { statBlockSystems } from "@/db/stat-block-systems";
import { ownedStory } from "@/db/story-access";
import { requireAccount } from "@/lib/authorize";
import { publishLater } from "@/lib/realtime/publish";
import { publishElementChanged, publishSceneElement } from "@/lib/realtime/publish-scene";
import { readStatBlocks, statBlocksSchema } from "@/lib/stat-block-schemas";
import {
  carriedGroups,
  emptyStatBlock,
  evaluateStatBlock,
  findGroup,
  findStat,
  isRepeating,
  matchRackEntry,
  rowKeyText,
  rowsOf,
  systemKey,
  tidyStatBlock,
  type EvaluatedGroup,
  type EvaluatedStat,
  type StatBlock,
  type StatBlockDefinition,
  type StatBlocks,
  type StatBlockSystem,
  type StatGroupDefinition,
  type StatRow,
  type StatValue,
} from "@/lib/stat-blocks";
import { normalizeDice, rollText, type Roll } from "@/lib/roll";
import { rollDice, rollTotal } from "@/lib/dice";
import { currentScene, type CurrentScene } from "@/db/scene-items";
import { insertChat } from "@/db/chats";
import { publishChat } from "@/lib/realtime/publish";
import { isElementShowing, pillText, SCENE_ELEMENT_HIDDEN } from "@/lib/run";
import { formErrors } from "@/lib/forms";
import { ELEMENT_NOT_YOURS, NOTHING_TO_ROLL } from "@/lib/messages";

const { elements, sceneElements, stories, storyScenes } = schema;

// The stat blocks of an element, or of a scene element, as the table reads
// and changes them. Beside the component rather than under the run route,
// as the feedback popover's action is: the run page's element panel is the
// first holder, and the players' table may be the next. An element and a
// scene element hold blocks the same way (elements.stat_blocks and
// scene_elements.stat_blocks, one a copy of the other at link time), so
// every action takes a StatBlockHolder saying which, and the reads and
// writes below are over whichever table it names. A scene element's blocks
// are not held by its scene's lock: the storyteller keeps the stats of a
// finished scene's creatures up to date after the fact, so these writes
// set the lock aside on purpose where the other writes to a link refuse it.

/** Whose blocks: an element's own, or a scene element's copy. Both within a story of the caller's. */
export type StatBlockHolder =
  { idStory: number; idElement: number } | { idStory: number; idSceneElement: number };

/** One system's block on a holder, worked out for showing. */
export type ElementStatBlock = {
  idSystem: number;
  label: string;
  definition: StatBlockDefinition;
  /** False for the story's own system when the holder has no block for it yet: the picker is all there is, and the first pick stores it. */
  stored: boolean;
  /** The block as stored, tidied: what the panel's edit form starts from. */
  block: StatBlock;
  /** The names of the template's groups the block carries, in template order. */
  carried: string[];
  groups: EvaluatedGroup[];
  /**
   * For a scene element's block, whether its element carries a block of
   * the same system, which Copy stats to the element would overwrite and so
   * asks about first. Absent for an element's own block, and wherever the
   * answer was not read.
   */
  onElement?: boolean;
};

/** What a change to one stat carries: the parts the stat stores. */
export type StatPatch = { value?: number | string; min?: number; max?: number };

/** Which stat of which block a change names, and the change; a row's by its key. */
export type StatChange = {
  idSystem: number;
  group: string;
  stat: string;
  patch: StatPatch;
  rowKey?: string;
};

/** Which stat of which block a die rolls, and whose roll it is; a row's by its key. */
export type StatRoll = {
  idSystem: number;
  group: string;
  stat: string;
  as: RollAs;
  rowKey?: string;
};

export type SetElementStatResult =
  { ok: true; block: ElementStatBlock } | { ok: false; error: string };

/**
 * Whose roll a die at the table makes: the words the chat gives it (what
 * the pill shows the element as), and whether it stays off the chat and is
 * only shown to the storyteller, as a roll for an invisible element is.
 */
export type RollAs = { title: string; quiet: boolean };

/** A roll made from a stat's die: the roll, and whether the chat has it or only the caller does. */
export type RollStatResult =
  { ok: true; roll: Roll; posted: boolean } | { ok: false; error: string };

export type SetStatBlocksResult =
  | {
      ok: true;
      blocks: ElementStatBlock[];
      /** The element had no stat blocks, so it was given the scene element's (sa_setStatBlocks). */
      copiedToElement: boolean;
    }
  | { ok: false; errors: Record<string, string> };

export type CopyStatBlocksResult = { ok: true } | { ok: false; error: string };

export type CopyStatBlocksFromElementResult =
  { ok: true; blocks: ElementStatBlock[] } | { ok: false; error: string };

/** One scene element's stat blocks as the table's stats pane lists them. */
export type SceneStatBlocks = {
  idSceneElement: number;
  idElement: number;
  /** What the pill shows the element as (pillText): the name its rolls go by in the chat. */
  title: string;
  /** Whether the element is invisible to the players, so its rolls stay off the chat. */
  hidden: boolean;
  blocks: ElementStatBlock[];
};

/**
 * One roll among many: an element's of a global stat (sa_rollStatForAll),
 * which names its link so the pane can put the total by the element, or a
 * row's of a group rolled all at once (sa_rollGroupRows), which has no link
 * of its own to name.
 */
export type RolledForOne = {
  title: string;
  roll: Roll;
  posted: boolean;
  idSceneElement?: number;
};

export type RollAllResult = { ok: true; rolls: RolledForOne[] } | { ok: false; error: string };

const nameSchema = z.string().min(1).max(40);
const rowKeySchema = z.string().trim().min(1).max(200).optional();
const rollAsSchema = z.object({ title: z.string().trim().max(200), quiet: z.boolean() });
const patchSchema = z.object({
  value: z.union([z.number().finite(), z.string().max(200)]).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
});
const holderSchema = z.union([
  z.object({ idStory: idSchema, idElement: idSchema }),
  z.object({ idStory: idSchema, idSceneElement: idSchema }),
]);
const changeSchema = z.object({
  idSystem: idSchema,
  group: nameSchema,
  stat: nameSchema,
  patch: patchSchema,
  rowKey: rowKeySchema,
});
const rollSchema = z.object({
  idSystem: idSchema,
  group: nameSchema,
  stat: nameSchema,
  as: rollAsSchema,
  rowKey: rowKeySchema,
});

const NOT_SETTABLE = { ok: false as const, error: "That stat is not one that can be set." };
const NO_STATS = { ok: false as const, error: "That system has no stats to fill in." };

/**
 * The holder's row as the actions need it: its stored blocks, the story's
 * system, and, for a scene element, the element and scene it links, which
 * the realtime event names. Null when the holder is not the story's.
 */
type Loaded = {
  blocks: StatBlocks;
  storySystem: number | null;
  /**
   * For a scene element, what its change is published as (the scene and the
   * link's own id, which the table draws a pill by) and the element it links,
   * whose own blocks a first save may fill in.
   */
  link: { idStoryScene: number; idSceneElement: number; idElement: number } | null;
  /** For a scene element, its element's own blocks; null for an element. */
  elementBlocks: StatBlocks | null;
};

async function loadHolder(holder: StatBlockHolder): Promise<Loaded | null> {
  if ("idElement" in holder) {
    const [row] = await db
      .select({ statBlocks: elements.statBlocks, storySystem: stories.idSystem })
      .from(elements)
      .innerJoin(stories, eq(stories.idStory, elements.idStory))
      .where(and(eq(elements.idElement, holder.idElement), eq(elements.idStory, holder.idStory)))
      .limit(1);
    return row
      ? {
          blocks: readStatBlocks(row.statBlocks),
          storySystem: row.storySystem,
          link: null,
          elementBlocks: null,
        }
      : null;
  }
  const [row] = await db
    .select({
      statBlocks: sceneElements.statBlocks,
      storySystem: stories.idSystem,
      idStoryScene: sceneElements.idStoryScene,
      idSceneElement: sceneElements.idSceneElement,
      idElement: sceneElements.idElement,
      elementBlocks: elements.statBlocks,
    })
    .from(sceneElements)
    .innerJoin(storyScenes, eq(storyScenes.idStoryScene, sceneElements.idStoryScene))
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .innerJoin(elements, eq(elements.idElement, sceneElements.idElement))
    .where(
      and(
        eq(sceneElements.idSceneElement, holder.idSceneElement),
        eq(storyScenes.idStory, holder.idStory),
      ),
    )
    .limit(1);
  return row
    ? {
        blocks: readStatBlocks(row.statBlocks),
        storySystem: row.storySystem,
        link: {
          idStoryScene: row.idStoryScene,
          idSceneElement: row.idSceneElement,
          idElement: row.idElement,
        },
        elementBlocks: readStatBlocks(row.elementBlocks),
      }
    : null;
}

/**
 * The holder's stat_blocks column set to an expression over itself, within
 * the story, giving the column back. One place for the two tables, so every
 * write below is the same whichever holds the blocks.
 */
async function writeBlocks(
  holder: StatBlockHolder,
  userId: string,
  next: (column: SQL) => SQL,
  tx: Pick<typeof db, "update"> = db,
): Promise<unknown | undefined> {
  if ("idElement" in holder) {
    const column = sql`${elements.statBlocks}`;
    const [row] = await tx
      .update(elements)
      .set({ statBlocks: next(column), idUpdatedByUser: userId })
      .where(and(eq(elements.idElement, holder.idElement), eq(elements.idStory, holder.idStory)))
      .returning({ statBlocks: elements.statBlocks });
    return row?.statBlocks;
  }
  const column = sql`${sceneElements.statBlocks}`;
  // The scene element's story is its scene's, so the story check is a
  // subquery rather than a join, which an UPDATE cannot carry.
  const [row] = await tx
    .update(sceneElements)
    .set({ statBlocks: next(column), idUpdatedByUser: userId })
    .where(
      and(
        eq(sceneElements.idSceneElement, holder.idSceneElement),
        sql`${sceneElements.idStoryScene} IN (SELECT ${storyScenes.idStoryScene} FROM ${storyScenes} WHERE ${storyScenes.idStory} = ${holder.idStory})`,
      ),
    )
    .returning({ statBlocks: sceneElements.statBlocks });
  return row?.statBlocks;
}

/** Tells the table what changed: the element, or the scene element in its scene. */
function announce(holder: StatBlockHolder, loaded: Loaded) {
  if ("idElement" in holder) {
    publishLater(() => publishElementChanged(holder.idStory, holder.idElement));
  } else if (loaded.link) {
    const { idStoryScene, idSceneElement } = loaded.link;
    publishLater(() => publishSceneElement(holder.idStory, idStoryScene, idSceneElement));
  }
}

/** Whether stored blocks carry a stat block, of one system or of any. */
function carries(blocks: StatBlocks, idSystem?: number): boolean {
  const keys = idSystem === undefined ? Object.keys(blocks) : [systemKey(idSystem)];
  return keys.some((key) => Object.keys(blocks[key] ?? {}).length > 0);
}

/**
 * One system's block worked out for showing; for a scene element, given its
 * element's blocks, with whether the element carries one of the system.
 */
function evaluated(
  system: StatBlockSystem,
  block: StatBlock | undefined,
  stored: boolean,
  elementBlocks: StatBlocks | null = null,
): ElementStatBlock {
  const tidy = block ? tidyStatBlock(system.definition, block) : {};
  return {
    idSystem: system.idSystem,
    label: system.label,
    definition: system.definition,
    stored,
    block: tidy,
    carried: carriedGroups(system.definition, tidy).map((group) => group.name),
    groups: evaluateStatBlock(system.definition, tidy),
    ...(elementBlocks === null ? {} : { onElement: carries(elementBlocks, system.idSystem) }),
  };
}

/**
 * Every block the holder carries, each worked out against its system's
 * definition, the story's own system first. When the story's system has
 * stats and the holder has no block for it yet, that system comes too with
 * no groups, flagged as not stored, so the panel offers its picker and the
 * first pick makes the block. Null when the story is not the caller's or
 * the holder not the story's.
 */
export async function sa_getStatBlocks(
  holder: StatBlockHolder,
): Promise<ElementStatBlock[] | null> {
  const user = await requireAccount();
  const parsed = holderSchema.safeParse(holder);
  if (!parsed.success) return null;
  if ((await ownedStory(user.id, parsed.data.idStory)) === null) return null;

  const found = await loadHolder(parsed.data);
  if (!found) return null;
  return blocksOf(
    await statBlockSystems(parsed.data.idStory),
    found.storySystem,
    found.blocks,
    found.elementBlocks,
  );
}

/** Every block in the stored blocks, worked out, the story's own system first and always there. */
function blocksOf(
  systems: StatBlockSystem[],
  storySystem: number | null,
  blocks: StatBlocks,
  elementBlocks: StatBlocks | null = null,
): ElementStatBlock[] {
  const result: ElementStatBlock[] = [];
  const own = systems.find((system) => system.idSystem === storySystem);
  if (own) {
    const key = systemKey(own.idSystem);
    result.push(evaluated(own, blocks[key], key in blocks, elementBlocks));
  }
  for (const system of systems) {
    if (system === own) continue;
    const block = blocks[systemKey(system.idSystem)];
    if (block) result.push(evaluated(system, block, true, elementBlocks));
  }
  return result;
}

/**
 * The stat's stored parts after a change, clamped rather than refused: a +
 * past a pool's max at the table should stop at the max, not complain.
 * Null for a stat that stores nothing (computed, or a display that is fed).
 */
function clamped(
  system: StatBlockSystem,
  groupName: string,
  statName: string,
  block: StatBlock,
  patch: StatPatch,
  rowIndex: number | null,
): StatValue | null {
  const stat = findStat(system.definition, groupName, statName);
  if (!stat) return null;
  const group = evaluateStatBlock(system.definition, block).find((g) => g.name === groupName)!;
  const current = (rowIndex === null ? group.stats : (group.rows[rowIndex]?.stats ?? [])).find(
    (candidate) => candidate.name === statName,
  );
  if (!current) return null;
  const number = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  switch (stat.type) {
    case "display":
      return { value: patch.value ?? current.stored?.value ?? 0 };
    case "pool": {
      const min = number(patch.min, current.min ?? 0);
      const max = number(patch.max, current.stored?.max ?? number(current.max, 0));
      let value = number(patch.value, number(current.value, min));
      value = Math.max(value, min);
      value = Math.min(value, max);
      return { value, min, max };
    }
    case "stack": {
      const max = "max" in patch ? patch.max : current.stored?.max;
      let value = Math.max(0, number(patch.value, number(current.value, 0)));
      if (typeof max === "number") value = Math.min(value, Math.max(0, max));
      const next: StatValue = { value };
      if (typeof max === "number") next.max = Math.max(0, max);
      return next;
    }
    case "rack": {
      const entry = matchRackEntry(stat.rack, patch.value) ?? current.stored?.value ?? stat.rack[0];
      return entry === undefined ? null : { value: entry };
    }
    case "dice": {
      const dice = typeof patch.value === "string" ? normalizeDice(patch.value) : null;
      return { value: dice ?? current.stored?.value ?? "" };
    }
    case "computed":
      return null;
  }
}

/**
 * The holder and the system a change names, checked for the caller; or the
 * refusal to answer with. The caller is asked for by each action itself
 * (requireAccount), as test/guest-gate.test.ts wants to see. A holder or a
 * system that is not one is refused as an element that is not the caller's.
 */
async function target(
  userId: string,
  holder: StatBlockHolder,
  idSystem: number,
): Promise<
  | { ok: true; holder: StatBlockHolder; found: Loaded; system: StatBlockSystem }
  | { ok: false; error: string }
> {
  const parsed = holderSchema.safeParse(holder);
  const system = idSchema.safeParse(idSystem);
  if (!parsed.success || !system.success) return { ok: false, error: ELEMENT_NOT_YOURS };
  if ((await ownedStory(userId, parsed.data.idStory)) === null) {
    return { ok: false, error: ELEMENT_NOT_YOURS };
  }
  const found = await loadHolder(parsed.data);
  if (!found) return { ok: false, error: ELEMENT_NOT_YOURS };
  const systems = await statBlockSystems(parsed.data.idStory);
  const known = systems.find((candidate) => candidate.idSystem === system.data);
  if (!known) return NO_STATS;
  return { ok: true, holder: parsed.data, found, system: known };
}

/** The system's block as written, worked out for the answer, with the element's blocks beside a scene element's. */
function evaluatedWritten(
  system: StatBlockSystem,
  written: unknown,
  found: Loaded,
): ElementStatBlock {
  return evaluated(
    system,
    readStatBlocks(written)[systemKey(system.idSystem)],
    true,
    found.elementBlocks,
  );
}

/** One group of an evaluated block by name, or undefined. */
function evaluatedGroupNamed(block: ElementStatBlock, name: string): EvaluatedGroup | undefined {
  return block.groups.find((group) => group.name === name);
}

/**
 * Rewrites the rows of a repeating group on the holder, whole, under the
 * holder's lock: jsonb has no operator that replaces one element of an
 * array by the value of one of its fields, so the system's block is read
 * with the row locked, the row found by its key, and the block written back
 * whole inside one transaction. `rewrite` says what the rows become, given
 * the row's index; a row the prep form has since removed is refused rather
 * than landing on another. What a stat change on a row and the default-row
 * star have in common.
 */
async function rewriteRows(
  holder: StatBlockHolder,
  userId: string,
  system: StatBlockSystem,
  groupDefinition: StatGroupDefinition,
  key: string,
  rewrite: (rows: StatRow[], index: number, block: StatBlock) => StatRow[] | null,
): Promise<{ ok: true; statBlocks: unknown } | { ok: false; error: string }> {
  const systemKeyText = systemKey(system.idSystem);
  const label = groupDefinition.label || groupDefinition.name;
  return db.transaction(async (tx) => {
    // Locked through the holder's own table, so two row changes queue.
    const locked = await lockedBlocks(tx, holder);
    if (locked === undefined) return { ok: false as const, error: ELEMENT_NOT_YOURS };
    const stored = readStatBlocks(locked)[systemKeyText];
    const block = stored
      ? tidyStatBlock(system.definition, stored)
      : emptyStatBlock(system.definition, rollTotal);
    const rows = rowsOf(groupDefinition, block[groupDefinition.name]);
    const index = rows.findIndex((row) => rowKeyText(row[groupDefinition.keyedBy]?.value) === key);
    if (index === -1) return { ok: false as const, error: `That ${label} is no longer there.` };
    const written = rewrite(rows, index, block);
    if (written === null) return NOT_SETTABLE;
    const statBlocks = await writeBlocks(
      holder,
      userId,
      (column) =>
        sql`${column} || jsonb_build_object(${systemKeyText}::text, ${JSON.stringify({ ...block, [groupDefinition.name]: written })}::jsonb)`,
      tx,
    );
    if (statBlocks === undefined) return { ok: false as const, error: ELEMENT_NOT_YOURS };
    return { ok: true as const, statBlocks };
  });
}

/**
 * Changes one stat of one block at the table: a pool spent or refilled, a
 * stack counted, a rack moved, a display set. The value is clamped against
 * the definition (see clamped). For a plain group, one UPDATE merges the
 * system, group and stat levels with ||, so two stats changed at once do
 * not overwrite each other and a first change on a holder with no block
 * creates the keys above it, which jsonb_set would not. A repeating group
 * takes the row's key as well and is written whole under the holder's lock
 * (rewriteRows). The key stat itself is set on the prep form, not here. The
 * table is told, as any change is. The block comes back worked out.
 */
export async function sa_setStat(
  holder: StatBlockHolder,
  change: StatChange,
): Promise<SetElementStatResult> {
  const user = await requireAccount();
  const asked = changeSchema.safeParse(change);
  if (!asked.success) return NOT_SETTABLE;
  const { group: groupName, stat: statName, patch, rowKey: key } = asked.data;
  const checked = await target(user.id, holder, asked.data.idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;
  const groupDefinition = findGroup(system.definition, groupName);
  if (!groupDefinition) return NOT_SETTABLE;

  const systemKeyText = systemKey(system.idSystem);
  const repeating = isRepeating(groupDefinition);
  // A row key belongs to a repeating group and to no other; the key stat is
  // the row's name, changed on the prep form rather than at the table.
  if (repeating !== (key !== undefined)) return NOT_SETTABLE;
  if (repeating && statName === groupDefinition.keyedBy) return NOT_SETTABLE;

  if (!repeating) {
    const block = found.blocks[systemKeyText]
      ? tidyStatBlock(system.definition, found.blocks[systemKeyText])
      : emptyStatBlock(system.definition, rollTotal);
    const next = clamped(system, groupName, statName, block, patch, null);
    if (next === null) return NOT_SETTABLE;

    // The group level merges only into an object: a group made plain again
    // may still hold a row array on this holder, and || on an array would
    // append the stat as one more element and lose the change. Such an
    // array reads as nothing stored, so it is replaced.
    const written = await writeBlocks(
      checked.holder,
      user.id,
      (column) => sql`${column} || jsonb_build_object(${systemKeyText}::text,
          coalesce(${column} -> ${systemKeyText}, '{}'::jsonb) || jsonb_build_object(${groupName}::text,
            CASE WHEN jsonb_typeof(${column} -> ${systemKeyText} -> ${groupName}) = 'object' THEN ${column} -> ${systemKeyText} -> ${groupName} ELSE '{}'::jsonb END || jsonb_build_object(${statName}::text, ${JSON.stringify(next)}::jsonb)))`,
    );
    if (written === undefined) return { ok: false, error: ELEMENT_NOT_YOURS };

    announce(checked.holder, found);
    return { ok: true, block: evaluatedWritten(system, written, found) };
  }

  const result = await rewriteRows(
    checked.holder,
    user.id,
    system,
    groupDefinition,
    key!,
    (rows, index, block) => {
      // Clamped against the block as the lock found it, not as the table read it.
      const next = clamped(system, groupName, statName, block, patch, index);
      return next === null
        ? null
        : rows.map((row, i) => (i === index ? { ...row, [statName]: next } : row));
    },
  );
  if (!result.ok) return result;

  announce(checked.holder, found);
  return { ok: true, block: evaluatedWritten(system, result.statBlocks, found) };
}

/** The holder's blocks read FOR UPDATE inside a transaction; undefined when the row is not there. */
async function lockedBlocks(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  holder: StatBlockHolder,
): Promise<unknown | undefined> {
  if ("idElement" in holder) {
    const [row] = await tx
      .select({ statBlocks: elements.statBlocks })
      .from(elements)
      .where(and(eq(elements.idElement, holder.idElement), eq(elements.idStory, holder.idStory)))
      .for("update");
    return row?.statBlocks;
  }
  const [row] = await tx
    .select({ statBlocks: sceneElements.statBlocks })
    .from(sceneElements)
    .where(eq(sceneElements.idSceneElement, holder.idSceneElement))
    .for("update");
  return row?.statBlocks;
}

/**
 * The holder's blocks set whole from the panel's edit form, checked
 * against the systems' definitions as the prep form's post is
 * (statBlocksSchema), the errors keyed by the form's field paths. Only the
 * systems posted are written; a stored block for another system is left as
 * it is.
 *
 * A scene element's first stat blocks go to its element as well when the
 * element has none of its own, so stats made up at the table become what
 * the element is prepared with and the next copy of it starts from them
 * (copiedToElement says so). An element that carries any block keeps it
 * untouched: the check is in the UPDATE's WHERE, so nothing of the
 * element's is ever overwritten here.
 */
export async function sa_setStatBlocks(
  holder: StatBlockHolder,
  blocks: unknown,
): Promise<SetStatBlocksResult> {
  const user = await requireAccount();
  const parsed = holderSchema.safeParse(holder);
  const gone = { ok: false as const, errors: { root: ELEMENT_NOT_YOURS } };
  if (!parsed.success) return gone;
  if ((await ownedStory(user.id, parsed.data.idStory)) === null) return gone;
  const found = await loadHolder(parsed.data);
  if (!found) return gone;

  const systems = await statBlockSystems(parsed.data.idStory);
  const checked = statBlocksSchema(systems).safeParse(blocks ?? {});
  if (!checked.success) {
    return { ok: false, errors: formErrors(checked.error, ["statBlocks"]) };
  }
  // The holder's write and the copy onto a bare element land together, so a
  // failure between them cannot leave the element with blocks its scene
  // element never got. Announced only once both are in.
  const link = found.link;
  const { written, copiedToElement } = await db.transaction(async (tx) => {
    const written = await writeBlocks(
      parsed.data,
      user.id,
      (column) => sql`${column} || ${JSON.stringify(checked.data)}::jsonb`,
      tx,
    );
    if (written === undefined) return { written, copiedToElement: false };
    const saved = readStatBlocks(written);
    const copiedToElement =
      link !== null &&
      carries(saved) &&
      (await giveToBareElement(parsed.data.idStory, link.idElement, saved, user.id, tx));
    return { written, copiedToElement };
  });
  if (written === undefined) return gone;
  announce(parsed.data, found);
  if (copiedToElement && link) {
    publishLater(() => publishElementChanged(parsed.data.idStory, link.idElement));
  }
  const saved = readStatBlocks(written);
  return {
    ok: true,
    blocks: blocksOf(
      systems,
      found.storySystem,
      saved,
      copiedToElement ? saved : found.elementBlocks,
    ),
    copiedToElement,
  };
}

/**
 * Writes a scene element's blocks onto its element when the element
 * carries none of its own; whether it did, for the caller to tell the table
 * once its transaction has committed. An element whose blocks hold any group
 * is left alone, decided in the WHERE so a block given to it since the scene
 * element was read is not overwritten.
 */
async function giveToBareElement(
  idStory: number,
  idElement: number,
  blocks: StatBlocks,
  userId: string,
  tx: Pick<typeof db, "update"> = db,
): Promise<boolean> {
  const [row] = await tx
    .update(elements)
    .set({ statBlocks: blocks, idUpdatedByUser: userId })
    .where(
      and(
        eq(elements.idElement, idElement),
        eq(elements.idStory, idStory),
        sql`NOT EXISTS (SELECT 1 FROM jsonb_each(${elements.statBlocks}) AS held(key, block) WHERE held.block <> '{}'::jsonb)`,
      ),
    )
    .returning({ idElement: elements.idElement });
  return row !== undefined;
}

/**
 * The table's Copy stats to the element: one system's block as the scene
 * element holds it now, written over the element's own block for that
 * system, so what play made of the stats becomes the baseline the element
 * is prepared with. The element's other systems' blocks stay. Only a scene
 * element has a copy to hand back; an element holder is refused.
 */
export async function sa_copyStatBlocksToElement(
  holder: StatBlockHolder,
  idSystem: number,
): Promise<CopyStatBlocksResult> {
  const user = await requireAccount();
  const checked = await target(user.id, holder, idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;
  if (!("idSceneElement" in checked.holder) || !found.link) {
    return { ok: false, error: "Only an element in a scene has stats to copy back." };
  }
  const key = systemKey(system.idSystem);
  const block = found.blocks[key] ?? {};
  const [row] = await db
    .update(elements)
    .set({
      statBlocks: sql`${elements.statBlocks} || ${JSON.stringify({ [key]: block })}::jsonb`,
      idUpdatedByUser: user.id,
    })
    .where(and(eq(elements.idElement, found.link.idElement), eq(elements.idStory, holder.idStory)))
    .returning({ idElement: elements.idElement });
  if (!row) return { ok: false, error: ELEMENT_NOT_YOURS };
  publishLater(() => publishElementChanged(holder.idStory, row.idElement));
  return { ok: true };
}

/**
 * The table's Copy stats from the element: the element's stat blocks as
 * they stand, every system's, written over the scene element's copy, so a
 * link made before the element was prepared, or played far from its
 * baseline, starts again from it. The blocks come back worked out, as
 * sa_setStatBlocks answers. Only a scene element has a copy to overwrite.
 */
export async function sa_copyStatBlocksFromElement(
  holder: StatBlockHolder,
): Promise<CopyStatBlocksFromElementResult> {
  const user = await requireAccount();
  const parsed = holderSchema.safeParse(holder);
  if (!parsed.success) return { ok: false, error: ELEMENT_NOT_YOURS };
  if (!("idSceneElement" in parsed.data)) {
    return { ok: false, error: "Only an element in a scene has a copy of its stats." };
  }
  if ((await ownedStory(user.id, parsed.data.idStory)) === null) {
    return { ok: false, error: ELEMENT_NOT_YOURS };
  }
  const found = await loadHolder(parsed.data);
  if (!found?.link) return { ok: false, error: ELEMENT_NOT_YOURS };
  const [element] = await db
    .select({ statBlocks: elements.statBlocks })
    .from(elements)
    .where(eq(elements.idElement, found.link.idElement))
    .limit(1);
  if (!element) return { ok: false, error: ELEMENT_NOT_YOURS };
  const written = await writeBlocks(
    parsed.data,
    user.id,
    () => sql`${JSON.stringify(readStatBlocks(element.statBlocks))}::jsonb`,
  );
  if (written === undefined) return { ok: false, error: ELEMENT_NOT_YOURS };
  announce(parsed.data, found);
  return {
    ok: true,
    blocks: blocksOf(
      await statBlockSystems(parsed.data.idStory),
      found.storySystem,
      readStatBlocks(written),
      readStatBlocks(element.statBlocks),
    ),
  };
}

/**
 * The star on a row of a repeating group at the table: makes the row the
 * group's default by moving it to the front, the rows otherwise keeping
 * their order. The first row is the default, with nothing else stored to
 * say so: Roll for all rolls it, and the prep form's own star moves rows
 * the same way. Written as a row change is, whole under the holder's lock
 * (rewriteRows).
 */
export async function sa_setDefaultRow(
  holder: StatBlockHolder,
  idSystem: number,
  group: string,
  rowKey: string,
): Promise<SetElementStatResult> {
  const user = await requireAccount();
  const groupName = nameSchema.safeParse(group);
  const key = rowKeySchema.safeParse(rowKey);
  const notRepeating = {
    ok: false as const,
    error: "Only a repeating stat block has a default row.",
  };
  if (!groupName.success || !key.success || key.data === undefined) return notRepeating;
  const checked = await target(user.id, holder, idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;
  const groupDefinition = findGroup(system.definition, groupName.data);
  if (!groupDefinition || !isRepeating(groupDefinition)) return notRepeating;
  const result = await rewriteRows(
    checked.holder,
    user.id,
    system,
    groupDefinition,
    key.data,
    (rows, index) => [rows[index], ...rows.filter((_, i) => i !== index)],
  );
  if (!result.ok) return result;
  announce(checked.holder, found);
  return { ok: true, block: evaluatedWritten(system, result.statBlocks, found) };
}

/**
 * Rolls a stat's die at the table: a dice stat rolls the dice it holds, and
 * a pool, a stack or a numbered display rolls the die its definition gives
 * it with the stat's value added on ("1d20+3"), or the die alone when there
 * is no value yet. Rolled here, as the chat's /roll is, so nobody sends a
 * result of their own. The line goes to the table chat as a roll for the
 * element under the words the pill shows it by ("9 for A hooded figure:
 * Strike"), unless the roll is quiet (an invisible element's), or no
 * session is being played and there is no table to say it at; either way
 * the roll comes back for the storyteller to see.
 */
export async function sa_rollStat(
  holder: StatBlockHolder,
  roll: StatRoll,
): Promise<RollStatResult> {
  const user = await requireAccount();
  const asked = rollSchema.safeParse(roll);
  if (!asked.success) return { ok: false, error: NOTHING_TO_ROLL };
  const { group: groupName, stat: statName, as: rollAs, rowKey: key } = asked.data;
  const checked = await target(user.id, holder, asked.data.idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;

  const block = evaluated(system, found.blocks[systemKey(system.idSystem)], true);
  const evaluatedGroup = evaluatedGroupNamed(block, groupName);
  if (!evaluatedGroup) return { ok: false, error: NOTHING_TO_ROLL };
  const stats =
    key === undefined
      ? evaluatedGroup.stats
      : (evaluatedGroup.rows.find((row) => rowKeyText(row.key) === key)?.stats ?? []);
  const rolled = stats.find((candidate) => candidate.name === statName);
  if (!rolled) return { ok: false, error: NOTHING_TO_ROLL };

  const notation = notationFor(rolled);
  if (notation === "") return { ok: false, error: NOTHING_TO_ROLL };

  const title = rollAs.title === "" ? rolled.label : `${rollAs.title}: ${rolled.label}`;
  const result = rollDice(notation, `for ${title}`);
  if (!result.ok) return result;
  if (rollAs.quiet) return { ok: true, roll: result.roll, posted: false };

  const current = await currentScene(checked.holder.idStory);
  if (current === null) return { ok: true, roll: result.roll, posted: false };
  await sayRoll(checked.holder.idStory, current, user.id, result.roll);
  return { ok: true, roll: result.roll, posted: true };
}

/**
 * The table's Roll All on a group that repeats and is marked for it
 * (rollAll): one roll per row, of the first stat in the row with a die
 * (notationFor), each under the element's title and the row's key ("A
 * hooded figure (Sword): Strike"), and each row as many times as the
 * element has of it (the row's multiple, "A hooded figure (Sword) 2/4")
 * where the group can have more than one. Said in the chat or kept back as
 * sa_rollStat says one roll, and every roll comes back saying whether the
 * chat has it. A row with nothing to roll is passed over.
 */
export async function sa_rollGroupRows(
  holder: StatBlockHolder,
  idSystem: number,
  group: string,
  as: RollAs,
): Promise<RollAllResult> {
  const user = await requireAccount();
  const notRolledAll = { ok: false as const, error: "That group is not rolled all at once." };
  const groupName = nameSchema.safeParse(group);
  const rollAs = rollAsSchema.safeParse(as);
  if (!groupName.success || !rollAs.success) return notRolledAll;
  const checked = await target(user.id, holder, idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;

  const block = evaluated(system, found.blocks[systemKey(system.idSystem)], true);
  const evaluatedGroup = evaluatedGroupNamed(block, groupName.data);
  if (!evaluatedGroup || !isRepeating(evaluatedGroup) || !evaluatedGroup.rollAll)
    return notRolledAll;

  const current = rollAs.data.quiet ? null : await currentScene(checked.holder.idStory);
  const rolls: RolledForOne[] = [];
  for (const row of evaluatedGroup.rows) {
    const rolled = row.stats.find((candidate) => notationFor(candidate) !== "");
    if (!rolled) continue;
    const key = rowKeyText(row.key) ?? "";
    const who = rollAs.data.title === "" ? key : `${rollAs.data.title} (${key})`;
    const times = row.multiple;
    for (let n = 1; n <= times; n += 1) {
      const title = times > 1 ? `${who} ${n}/${times}` : who;
      const result = rollDice(notationFor(rolled), `for ${title}: ${rolled.label}`);
      if (!result.ok) continue;
      if (current !== null) await sayRoll(checked.holder.idStory, current, user.id, result.roll);
      rolls.push({ title, roll: result.roll, posted: current !== null });
    }
  }
  return { ok: true, rolls };
}

/**
 * What a stat's die rolls: a dice stat the dice it holds, any other its roll
 * with its value added as a bonus or a penalty ("1d20+3"), the die alone at
 * zero or with no value; "" when there is nothing to roll.
 */
function notationFor(rolled: EvaluatedStat): string {
  if (rolled.type === "dice") return typeof rolled.value === "string" ? rolled.value : "";
  if (rolled.roll === "") return "";
  if (typeof rolled.value === "number" && rolled.value !== 0) {
    return `${rolled.roll}${rolled.value < 0 ? "-" : "+"}${Math.abs(rolled.value)}`;
  }
  return rolled.roll;
}

/** Says a roll in the table chat, on the scene being played. */
async function sayRoll(idStory: number, current: CurrentScene, userId: string, roll: Roll) {
  const chat = await insertChat({
    idStory,
    idStoryScene: current.idStoryScene,
    text: rollText(roll),
    isSystem: false,
    userId,
    roll,
  });
  publishLater(() => publishChat(idStory, chat));
}

/**
 * The scene's links with their stored blocks and what the pane needs beside
 * them, by name. Each link's element is held to the story as well, as
 * spaceFor does: nothing in the database ties a link's element to its
 * scene's story.
 */
async function sceneLinks(idStory: number, idStoryScene: number) {
  return db
    .select({
      idSceneElement: sceneElements.idSceneElement,
      idElement: sceneElements.idElement,
      status: sceneElements.status,
      showing: sceneElements.elementShowing,
      initialName: elements.initialName,
      name: elements.name,
      title: elements.title,
      label: sceneElements.label,
      statBlocks: sceneElements.statBlocks,
      elementBlocks: elements.statBlocks,
      storySystem: stories.idSystem,
    })
    .from(sceneElements)
    .innerJoin(storyScenes, eq(storyScenes.idStoryScene, sceneElements.idStoryScene))
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .innerJoin(elements, eq(elements.idElement, sceneElements.idElement))
    .where(
      and(
        eq(sceneElements.idStoryScene, idStoryScene),
        eq(storyScenes.idStory, idStory),
        eq(elements.idStory, idStory),
      ),
    )
    .orderBy(asc(elements.name), asc(elements.idElement));
}

type SceneLink = Awaited<ReturnType<typeof sceneLinks>>[number];

/** The words a link's rolls go by: what its pill shows the element as. */
function linkTitle(link: SceneLink): string {
  const showing = isElementShowing(link.showing) ? link.showing : "name";
  return pillText(
    { initial_name: link.initialName, name: link.name, title: link.title, label: link.label },
    showing,
  ).label;
}

/**
 * The stat blocks of every element in the scene that carries one, for the
 * table's stats pane: visible or not, each worked out as sa_getStatBlocks
 * works one holder's out, with what the pill shows the element as and
 * whether it is invisible, so the pane's dice roll as the pill's do. By
 * name. Null when the story is not the caller's or the scene not the
 * story's; an empty list when no element in it has a block.
 */
export async function sa_getSceneStatBlocks(
  idStory: number,
  idStoryScene: number,
): Promise<SceneStatBlocks[] | null> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return null;
  if ((await ownedStory(user.id, story.data)) === null) return null;
  const [known] = await db
    .select({ idStoryScene: storyScenes.idStoryScene })
    .from(storyScenes)
    .where(and(eq(storyScenes.idStoryScene, scene.data), eq(storyScenes.idStory, story.data)))
    .limit(1);
  if (!known) return null;

  const systems = await statBlockSystems(story.data);
  const result: SceneStatBlocks[] = [];
  for (const link of await sceneLinks(story.data, scene.data)) {
    const blocks = blocksOf(
      systems,
      link.storySystem,
      readStatBlocks(link.statBlocks),
      readStatBlocks(link.elementBlocks),
    ).filter((block) => block.stored);
    if (blocks.length === 0) continue;
    result.push({
      idSceneElement: link.idSceneElement,
      idElement: link.idElement,
      title: linkTitle(link),
      hidden: link.status === SCENE_ELEMENT_HIDDEN,
      blocks,
    });
  }
  return result;
}

/**
 * The stats pane's Roll for all: one global stat of one system rolled for
 * every element in the scene that has it, each as sa_rollStat rolls one
 * (the die with the element's value added, or a dice stat's dice), a row
 * of a repeating group under the element's title and the row's key. Each
 * roll is said in the chat under what the pill shows the element as, but
 * an invisible element's stays off it, as does every roll while no session
 * is being played; the rolls all come back, each saying whether the chat
 * has it. An element whose stat has nothing to roll is passed over. Only a
 * stat the template marks global is rolled this way.
 */
export async function sa_rollStatForAll(
  idStory: number,
  idStoryScene: number,
  idSystem: number,
  group: string,
  stat: string,
): Promise<RollAllResult> {
  const user = await requireAccount();
  const asked = z
    .object({
      story: idSchema,
      scene: idSchema,
      system: idSchema,
      group: nameSchema,
      stat: nameSchema,
    })
    .safeParse({ story: idStory, scene: idStoryScene, system: idSystem, group, stat });
  if (!asked.success) return { ok: false, error: ELEMENT_NOT_YOURS };
  const { story, scene, group: groupName, stat: statName } = asked.data;
  if ((await ownedStory(user.id, story)) === null) return { ok: false, error: ELEMENT_NOT_YOURS };
  const system = (await statBlockSystems(story)).find(
    (candidate) => candidate.idSystem === asked.data.system,
  );
  if (!system) return NO_STATS;
  const definition = findStat(system.definition, groupName, statName);
  if (!definition?.global) return { ok: false, error: "That stat is not rolled for all." };

  const current = await currentScene(story);
  const rolls: RolledForOne[] = [];
  for (const link of await sceneLinks(story, scene)) {
    const blocks = readStatBlocks(link.statBlocks);
    const key = systemKey(system.idSystem);
    if (!(key in blocks)) continue;
    const evaluatedGroup = evaluatedGroupNamed(evaluated(system, blocks[key], true), groupName);
    if (!evaluatedGroup) continue;
    const title = linkTitle(link);
    // A plain group rolls its one stat; a repeating group its default row,
    // the first (sa_setDefaultRow), named after the element: an initiative
    // is rolled with the weapon in hand, not with every weapon carried.
    const sets = isRepeating(evaluatedGroup)
      ? evaluatedGroup.rows.slice(0, 1).map((row) => ({
          title: `${title} (${rowKeyText(row.key) ?? ""})`,
          stats: row.stats,
        }))
      : [{ title, stats: evaluatedGroup.stats }];
    for (const set of sets) {
      const rolled = set.stats.find((candidate) => candidate.name === statName);
      if (!rolled) continue;
      const notation = notationFor(rolled);
      if (notation === "") continue;
      const result = rollDice(notation, `for ${set.title}: ${rolled.label}`);
      if (!result.ok) continue;
      const quiet = current === null || link.status === SCENE_ELEMENT_HIDDEN;
      if (!quiet) await sayRoll(story, current, user.id, result.roll);
      rolls.push({
        title: set.title,
        roll: result.roll,
        posted: !quiet,
        idSceneElement: link.idSceneElement,
      });
    }
  }
  return { ok: true, rolls };
}
