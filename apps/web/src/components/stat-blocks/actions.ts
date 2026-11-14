"use server";

import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { statBlockSystems } from "@/db/stat-block-systems";
import { requireAccount } from "@/lib/authorize";
import { publishLater } from "@/lib/realtime/publish";
import { publishElementChanged, publishSceneElement } from "@/lib/realtime/publish-scene";
import { readStatBlocks, statBlocksSchema } from "@/lib/stat-block-schemas";
import {
  carriedGroups,
  emptyStatBlock,
  emptyStatGroup,
  evaluateStatBlock,
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
  type StatRow,
  type StatValue,
} from "@/lib/stat-blocks";
import { normalizeDice, rollText, type Roll } from "@/lib/roll";
import { rollDice, rollTotal } from "@/lib/dice";
import { currentScene, type CurrentScene } from "@/db/scene-items";
import { insertChat } from "@/db/chats";
import { publishChat } from "@/lib/realtime/publish";
import { isElementShowing, pillText, SCENE_ELEMENT_HIDDEN } from "@/lib/run";

const { elements, sceneElements, stories, storyScenes } = schema;

// The stat blocks of an element, or of a scene element, as the table reads
// and changes them. Beside the component rather than under the run route,
// as the feedback popover's action is: the run page's element panel is the
// first holder, and the players' table may be the next. An element and a
// scene element hold blocks the same way (elements.stat_blocks and
// scene_elements.stat_blocks, one a copy of the other at link time), so
// every action takes a StatBlockHolder saying which, and the reads and
// writes below are over whichever table it names.

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
};

/** What a change to one stat carries: the parts the stat stores. */
export type StatPatch = { value?: number | string; min?: number; max?: number };

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
  { ok: true; blocks: ElementStatBlock[] } | { ok: false; errors: Record<string, string> };

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

const idSchema = z.int32();
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

const GONE = "That element is not one of your story's.";
const NOT_SETTABLE = { ok: false as const, error: "That stat is not one that can be set." };

/** Whether the caller is the storyteller who created the story, as the run page's actions ask. */
async function ownsStory(userId: string, idStory: number): Promise<boolean> {
  const [row] = await db
    .select({ owner: stories.idCreatedByUser })
    .from(stories)
    .where(eq(stories.idStory, idStory))
    .limit(1);
  return row?.owner === userId;
}

/**
 * The holder's row as the actions need it: its stored blocks, the story's
 * system, and, for a scene element, the element and scene it links, which
 * the realtime event names. Null when the holder is not the story's.
 */
type Loaded = {
  blocks: StatBlocks;
  storySystem: number | null;
  /** For a scene element, what its change is published as. */
  link: { idStoryScene: number; idElement: number } | null;
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
      ? { blocks: readStatBlocks(row.statBlocks), storySystem: row.storySystem, link: null }
      : null;
  }
  const [row] = await db
    .select({
      statBlocks: sceneElements.statBlocks,
      storySystem: stories.idSystem,
      idStoryScene: sceneElements.idStoryScene,
      idElement: sceneElements.idElement,
    })
    .from(sceneElements)
    .innerJoin(storyScenes, eq(storyScenes.idStoryScene, sceneElements.idStoryScene))
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
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
        link: { idStoryScene: row.idStoryScene, idElement: row.idElement },
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
    const { idStoryScene, idElement } = loaded.link;
    publishLater(() => publishSceneElement(holder.idStory, idStoryScene, idElement));
  }
}

function evaluated(
  system: StatBlockSystem,
  block: StatBlock | undefined,
  stored: boolean,
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
  if (!(await ownsStory(user.id, parsed.data.idStory))) return null;

  const found = await loadHolder(parsed.data);
  if (!found) return null;
  return blocksOf(await statBlockSystems(), found.storySystem, found.blocks);
}

/** Every block in the stored blocks, worked out, the story's own system first and always there. */
function blocksOf(
  systems: StatBlockSystem[],
  storySystem: number | null,
  blocks: StatBlocks,
): ElementStatBlock[] {
  const result: ElementStatBlock[] = [];
  const own = systems.find((system) => system.idSystem === storySystem);
  if (own) {
    const key = systemKey(own.idSystem);
    result.push(evaluated(own, blocks[key], key in blocks));
  }
  for (const system of systems) {
    if (system === own) continue;
    const block = blocks[systemKey(system.idSystem)];
    if (block) result.push(evaluated(system, block, true));
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
 * (requireAccount), as test/guest-gate.test.ts wants to see.
 */
async function target(
  userId: string,
  holder: StatBlockHolder,
  idSystem: number,
): Promise<
  | { ok: true; holder: StatBlockHolder; found: Loaded; system: StatBlockSystem }
  | { ok: false; error: string }
> {
  const parsed = holderSchema.parse(holder);
  const system = idSchema.parse(idSystem);
  if (!(await ownsStory(userId, parsed.idStory))) return { ok: false, error: GONE };
  const found = await loadHolder(parsed);
  if (!found) return { ok: false, error: GONE };
  const systems = await statBlockSystems();
  const known = systems.find((candidate) => candidate.idSystem === system);
  if (!known) return { ok: false, error: "That system has no stats to fill in." };
  return { ok: true, holder: parsed, found, system: known };
}

/**
 * Changes one stat of one block at the table: a pool spent or refilled, a
 * stack counted, a rack moved, a display set. The value is clamped against
 * the definition (see clamped). For a plain group, one UPDATE merges the
 * system, group and stat levels with ||, so two stats changed at once do
 * not overwrite each other and a first change on a holder with no block
 * creates the keys above it, which jsonb_set would not. A repeating group
 * takes the row's key as well, and is written differently: jsonb has no
 * operator that replaces one element of an array by the value of one of
 * its fields, so the system's block is read with the row locked, the row
 * found by its key, and the block written back whole inside one
 * transaction; a row the prep form has since removed is refused rather
 * than landing on another. The key stat itself is set on the prep form,
 * not here. The table is told, as any change is. The block comes back
 * worked out.
 */
export async function sa_setStat(
  holder: StatBlockHolder,
  idSystem: number,
  group: string,
  stat: string,
  patch: StatPatch,
  rowKey?: string,
): Promise<SetElementStatResult> {
  const groupName = nameSchema.parse(group);
  const statName = nameSchema.parse(stat);
  const change = patchSchema.parse(patch);
  const key = rowKeySchema.parse(rowKey);
  const user = await requireAccount();
  const checked = await target(user.id, holder, idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;
  const groupDefinition = system.definition.groups.find((g) => g.name === groupName);
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
    const next = clamped(system, groupName, statName, block, change, null);
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
    if (written === undefined) return { ok: false, error: GONE };

    announce(checked.holder, found);
    return { ok: true, block: evaluated(system, readStatBlocks(written)[systemKeyText], true) };
  }

  const label = groupDefinition.label || groupDefinition.name;
  const result = await db.transaction(async (tx) => {
    // Locked through the holder's own table, so two row changes queue.
    const locked = await lockedBlocks(tx, checked.holder);
    if (locked === undefined) return { ok: false as const, error: GONE };
    const stored = readStatBlocks(locked)[systemKeyText];
    const block = stored
      ? tidyStatBlock(system.definition, stored)
      : emptyStatBlock(system.definition, rollTotal);
    const rows = rowsOf(groupDefinition, block[groupName]);
    const index = rows.findIndex((row) => rowKeyText(row[groupDefinition.keyedBy]?.value) === key);
    if (index === -1) return { ok: false as const, error: `That ${label} is no longer there.` };
    const next = clamped(system, groupName, statName, block, change, index);
    if (next === null) return NOT_SETTABLE;

    const written: StatRow[] = rows.map((row, i) =>
      i === index ? { ...row, [statName]: next } : row,
    );
    const statBlocks = await writeBlocks(
      checked.holder,
      user.id,
      (column) =>
        sql`${column} || jsonb_build_object(${systemKeyText}::text, ${JSON.stringify({ ...block, [groupName]: written })}::jsonb)`,
      tx,
    );
    if (statBlocks === undefined) return { ok: false as const, error: GONE };
    return { ok: true as const, statBlocks };
  });
  if (!result.ok) return result;

  announce(checked.holder, found);
  return {
    ok: true,
    block: evaluated(system, readStatBlocks(result.statBlocks)[systemKeyText], true),
  };
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
 * Picks one of the template's stat blocks for the holder: the group's
 * starting values go in under its name, unless the holder already carries
 * it, in which case nothing changes and the block comes back as it is. The
 * same merge as a stat change, so a first pick makes the system's block.
 */
export async function sa_addStatBlock(
  holder: StatBlockHolder,
  idSystem: number,
  group: string,
): Promise<SetElementStatResult> {
  const groupName = nameSchema.parse(group);
  const user = await requireAccount();
  const checked = await target(user.id, holder, idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;
  const groupDefinition = system.definition.groups.find((g) => g.name === groupName);
  if (!groupDefinition) return { ok: false, error: "That stat block is not in the template." };
  const systemKeyText = systemKey(system.idSystem);
  // Each stat's Initialized as is rolled here, once, as the block is made.
  const starting = emptyStatGroup(system.definition, groupDefinition, rollTotal);

  const written = await writeBlocks(
    checked.holder,
    user.id,
    (column) => sql`${column} || jsonb_build_object(${systemKeyText}::text,
        jsonb_build_object(${groupName}::text, ${JSON.stringify(starting)}::jsonb) || coalesce(${column} -> ${systemKeyText}, '{}'::jsonb))`,
  );
  if (written === undefined) return { ok: false, error: GONE };
  announce(checked.holder, found);
  return { ok: true, block: evaluated(system, readStatBlocks(written)[systemKeyText], true) };
}

/**
 * Takes one stat block off the holder, values and all; the system's key
 * stays, empty if that was its last, so the panel keeps offering the
 * picker. Nothing changes for a block the holder does not carry.
 */
export async function sa_removeStatBlock(
  holder: StatBlockHolder,
  idSystem: number,
  group: string,
): Promise<SetElementStatResult> {
  const groupName = nameSchema.parse(group);
  const user = await requireAccount();
  const checked = await target(user.id, holder, idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;
  const systemKeyText = systemKey(system.idSystem);

  const written = await writeBlocks(
    checked.holder,
    user.id,
    (column) => sql`${column} || jsonb_build_object(${systemKeyText}::text,
        coalesce(${column} -> ${systemKeyText}, '{}'::jsonb) - ${groupName}::text)`,
  );
  if (written === undefined) return { ok: false, error: GONE };
  announce(checked.holder, found);
  return { ok: true, block: evaluated(system, readStatBlocks(written)[systemKeyText], true) };
}

/**
 * The holder's blocks set whole from the panel's edit form, checked
 * against the systems' definitions as the prep form's post is
 * (statBlocksSchema), the errors keyed by the form's field paths. Only the
 * systems posted are written; a stored block for another system is left as
 * it is.
 */
export async function sa_setStatBlocks(
  holder: StatBlockHolder,
  blocks: unknown,
): Promise<SetStatBlocksResult> {
  const user = await requireAccount();
  const parsed = holderSchema.safeParse(holder);
  const gone = { ok: false as const, errors: { root: GONE } };
  if (!parsed.success) return gone;
  if (!(await ownsStory(user.id, parsed.data.idStory))) return gone;
  const found = await loadHolder(parsed.data);
  if (!found) return gone;

  const systems = await statBlockSystems();
  const checked = statBlocksSchema(systems).safeParse(blocks ?? {});
  if (!checked.success) {
    return {
      ok: false,
      errors: Object.fromEntries(
        checked.error.issues.map((issue) => [
          ["statBlocks", ...issue.path].join("."),
          issue.message,
        ]),
      ),
    };
  }
  const written = await writeBlocks(
    parsed.data,
    user.id,
    (column) => sql`${column} || ${JSON.stringify(checked.data)}::jsonb`,
  );
  if (written === undefined) return gone;
  announce(parsed.data, found);
  return { ok: true, blocks: blocksOf(systems, found.storySystem, readStatBlocks(written)) };
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
  if (!row) return { ok: false, error: GONE };
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
  if (!parsed.success) return { ok: false, error: GONE };
  if (!("idSceneElement" in parsed.data)) {
    return { ok: false, error: "Only an element in a scene has a copy of its stats." };
  }
  if (!(await ownsStory(user.id, parsed.data.idStory))) return { ok: false, error: GONE };
  const found = await loadHolder(parsed.data);
  if (!found?.link) return { ok: false, error: GONE };
  const [element] = await db
    .select({ statBlocks: elements.statBlocks })
    .from(elements)
    .where(eq(elements.idElement, found.link.idElement))
    .limit(1);
  if (!element) return { ok: false, error: GONE };
  const written = await writeBlocks(
    parsed.data,
    user.id,
    () => sql`${JSON.stringify(readStatBlocks(element.statBlocks))}::jsonb`,
  );
  if (written === undefined) return { ok: false, error: GONE };
  announce(parsed.data, found);
  return {
    ok: true,
    blocks: blocksOf(await statBlockSystems(), found.storySystem, readStatBlocks(written)),
  };
}

/**
 * The star on a row of a repeating group at the table: makes the row the
 * group's default by moving it to the front, the rows otherwise keeping
 * their order. The first row is the default, with nothing else stored to
 * say so: Roll for all rolls it, and the prep form's own star moves rows
 * the same way. Written as a row change is, whole under the holder's lock.
 */
export async function sa_setDefaultRow(
  holder: StatBlockHolder,
  idSystem: number,
  group: string,
  rowKey: string,
): Promise<SetElementStatResult> {
  const groupName = nameSchema.parse(group);
  const key = rowKeySchema.parse(rowKey);
  const user = await requireAccount();
  const checked = await target(user.id, holder, idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;
  const groupDefinition = system.definition.groups.find((g) => g.name === groupName);
  if (!groupDefinition || !isRepeating(groupDefinition) || key === undefined) {
    return { ok: false, error: "Only a repeating stat block has a default row." };
  }
  const systemKeyText = systemKey(system.idSystem);
  const label = groupDefinition.label || groupDefinition.name;
  const result = await db.transaction(async (tx) => {
    const locked = await lockedBlocks(tx, checked.holder);
    if (locked === undefined) return { ok: false as const, error: GONE };
    const stored = readStatBlocks(locked)[systemKeyText];
    const block = stored
      ? tidyStatBlock(system.definition, stored)
      : emptyStatBlock(system.definition, rollTotal);
    const rows = rowsOf(groupDefinition, block[groupName]);
    const index = rows.findIndex((row) => rowKeyText(row[groupDefinition.keyedBy]?.value) === key);
    if (index === -1) return { ok: false as const, error: `That ${label} is no longer there.` };
    const written = [rows[index], ...rows.filter((_, i) => i !== index)];
    const statBlocks = await writeBlocks(
      checked.holder,
      user.id,
      (column) =>
        sql`${column} || jsonb_build_object(${systemKeyText}::text, ${JSON.stringify({ ...block, [groupName]: written })}::jsonb)`,
      tx,
    );
    if (statBlocks === undefined) return { ok: false as const, error: GONE };
    return { ok: true as const, statBlocks };
  });
  if (!result.ok) return result;
  announce(checked.holder, found);
  return {
    ok: true,
    block: evaluated(system, readStatBlocks(result.statBlocks)[systemKeyText], true),
  };
}

const NOTHING_TO_ROLL = "There is nothing to roll.";

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
  idSystem: number,
  group: string,
  stat: string,
  as: RollAs,
  rowKey?: string,
): Promise<RollStatResult> {
  const groupName = nameSchema.parse(group);
  const statName = nameSchema.parse(stat);
  const key = rowKeySchema.parse(rowKey);
  const rollAs = rollAsSchema.parse(as);
  const user = await requireAccount();
  const checked = await target(user.id, holder, idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;

  const block = evaluated(system, found.blocks[systemKey(system.idSystem)], true);
  const evaluatedGroup = block.groups.find((g) => g.name === groupName);
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

  const current = await currentScene(holder.idStory);
  if (current === null) return { ok: true, roll: result.roll, posted: false };
  await sayRoll(holder.idStory, current, user.id, result.roll);
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
  const groupName = nameSchema.parse(group);
  const rollAs = rollAsSchema.parse(as);
  const user = await requireAccount();
  const checked = await target(user.id, holder, idSystem);
  if (!checked.ok) return checked;
  const { found, system } = checked;

  const block = evaluated(system, found.blocks[systemKey(system.idSystem)], true);
  const evaluatedGroup = block.groups.find((g) => g.name === groupName);
  if (!evaluatedGroup || !isRepeating(evaluatedGroup) || !evaluatedGroup.rollAll) {
    return { ok: false, error: "That group is not rolled all at once." };
  }

  const current = rollAs.quiet ? null : await currentScene(holder.idStory);
  const rolls: RolledForOne[] = [];
  for (const row of evaluatedGroup.rows) {
    const rolled = row.stats.find((candidate) => notationFor(candidate) !== "");
    if (!rolled) continue;
    const key = rowKeyText(row.key) ?? "";
    const who = rollAs.title === "" ? key : `${rollAs.title} (${key})`;
    const times = row.multiple;
    for (let n = 1; n <= times; n += 1) {
      const title = times > 1 ? `${who} ${n}/${times}` : who;
      const result = rollDice(notationFor(rolled), `for ${title}: ${rolled.label}`);
      if (!result.ok) continue;
      if (current !== null) await sayRoll(holder.idStory, current, user.id, result.roll);
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
  const story = idSchema.parse(idStory);
  const scene = idSchema.parse(idStoryScene);
  if (!(await ownsStory(user.id, story))) return null;
  const [known] = await db
    .select({ idStoryScene: storyScenes.idStoryScene })
    .from(storyScenes)
    .where(and(eq(storyScenes.idStoryScene, scene), eq(storyScenes.idStory, story)))
    .limit(1);
  if (!known) return null;

  const systems = await statBlockSystems();
  const result: SceneStatBlocks[] = [];
  for (const link of await sceneLinks(story, scene)) {
    const blocks = blocksOf(systems, link.storySystem, readStatBlocks(link.statBlocks)).filter(
      (block) => block.stored,
    );
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
  const groupName = nameSchema.parse(group);
  const statName = nameSchema.parse(stat);
  const user = await requireAccount();
  const story = idSchema.parse(idStory);
  const scene = idSchema.parse(idStoryScene);
  if (!(await ownsStory(user.id, story))) return { ok: false, error: GONE };
  const system = (await statBlockSystems()).find(
    (candidate) => candidate.idSystem === idSchema.parse(idSystem),
  );
  if (!system) return { ok: false, error: "That system has no stats to fill in." };
  const definition = findStat(system.definition, groupName, statName);
  if (!definition?.global) return { ok: false, error: "That stat is not rolled for all." };

  const current = await currentScene(story);
  const rolls: RolledForOne[] = [];
  for (const link of await sceneLinks(story, scene)) {
    const blocks = readStatBlocks(link.statBlocks);
    const key = systemKey(system.idSystem);
    if (!(key in blocks)) continue;
    const evaluatedGroup = evaluated(system, blocks[key], true).groups.find(
      (g) => g.name === groupName,
    );
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
