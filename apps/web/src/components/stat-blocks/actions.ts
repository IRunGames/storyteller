"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { statBlockSystems } from "@/db/stat-block-systems";
import { requireAccount } from "@/lib/authorize";
import { publishLater } from "@/lib/realtime/publish";
import { publishElementChanged } from "@/lib/realtime/publish-scene";
import { readStatBlocks } from "@/lib/stat-block-schemas";
import {
  canConnect,
  emptyStatBlock,
  evaluateStatBlock,
  findStat,
  matchRackEntry,
  resolveConnection,
  systemKey,
  type EvaluatedGroup,
  type StatBlock,
  type StatBlockDefinition,
  type StatBlockSystem,
  type StatValue,
} from "@/lib/stat-blocks";

const { elements, stories } = schema;

// The stat blocks of an element as the table reads and changes them. Beside
// the component rather than under the run route, as the feedback popover's
// action is: the run page's element panel is the first holder, and the
// players' table may be the next.

/** One system's block on an element, worked out for showing. */
export type ElementStatBlock = {
  idSystem: number;
  label: string;
  definition: StatBlockDefinition;
  /** False for the story's own system when the element has no block for it yet: the empty block is shown, and the first change stores it. */
  stored: boolean;
  groups: EvaluatedGroup[];
};

/** What a change to one stat carries: the parts the stat stores. */
export type StatPatch = { value?: number | string; min?: number; max?: number };

export type SetElementStatResult =
  { ok: true; block: ElementStatBlock } | { ok: false; error: string };

const idSchema = z.number().int().min(-2147483648).max(2147483647);
const nameSchema = z.string().min(1).max(40);
const patchSchema = z.object({
  value: z.union([z.number().finite(), z.string().max(200)]).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
});

/** Whether the caller is the storyteller who created the story, as the run page's actions ask. */
async function ownsStory(userId: string, idStory: number): Promise<boolean> {
  const [row] = await db
    .select({ owner: stories.idCreatedByUser })
    .from(stories)
    .where(eq(stories.idStory, idStory))
    .limit(1);
  return row?.owner === userId;
}

/** The element's stored blocks and its story's system, when the element is the story's. */
async function loadElement(idStory: number, idElement: number) {
  const [row] = await db
    .select({ statBlocks: elements.statBlocks, storySystem: stories.idSystem })
    .from(elements)
    .innerJoin(stories, eq(stories.idStory, elements.idStory))
    .where(and(eq(elements.idElement, idElement), eq(elements.idStory, idStory)))
    .limit(1);
  return row ? { blocks: readStatBlocks(row.statBlocks), storySystem: row.storySystem } : null;
}

function evaluated(
  system: StatBlockSystem,
  block: StatBlock | undefined,
  stored: boolean,
): ElementStatBlock {
  return {
    idSystem: system.idSystem,
    label: system.label,
    definition: system.definition,
    stored,
    groups: evaluateStatBlock(system.definition, block ?? emptyStatBlock(system.definition)),
  };
}

/**
 * Every block the element carries, each worked out against its system's
 * definition, the story's own system first. When the story's system has
 * stats and the element has no block for it yet, which is how every
 * element made at the table starts, that system's empty block comes too,
 * flagged as not stored, so the panel draws it and the first change makes
 * it. Null when the story is not the caller's or the element not the
 * story's.
 */
export async function sa_getElementStatBlocks(
  idStory: number,
  idElement: number,
): Promise<ElementStatBlock[] | null> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const element = idSchema.safeParse(idElement);
  if (!story.success || !element.success) return null;
  if (!(await ownsStory(user.id, story.data))) return null;

  const found = await loadElement(story.data, element.data);
  if (!found) return null;
  const systems = await statBlockSystems();

  const result: ElementStatBlock[] = [];
  const own = systems.find((system) => system.idSystem === found.storySystem);
  if (own)
    result.push(
      evaluated(
        own,
        found.blocks[systemKey(own.idSystem)],
        systemKey(own.idSystem) in found.blocks,
      ),
    );
  for (const system of systems) {
    if (system === own) continue;
    const block = found.blocks[systemKey(system.idSystem)];
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
): StatValue | null {
  const stat = findStat(system.definition, groupName, statName);
  if (!stat) return null;
  const current = evaluateStatBlock(system.definition, block)
    .find((group) => group.name === groupName)!
    .stats.find((candidate) => candidate.name === statName)!;
  const connected = canConnect(stat.type)
    ? resolveConnection(system.definition, groupName, stat.connectedTo) !== null
    : false;
  const number = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  switch (stat.type) {
    case "display":
      if (connected) return null;
      return { value: patch.value ?? current.stored?.value ?? 0 };
    case "pool": {
      const min = number(patch.min, current.min ?? 0);
      const max = connected
        ? current.max
        : number(patch.max, current.stored?.max ?? number(current.max, 0));
      let value = number(patch.value, number(current.value, min));
      value = Math.max(value, min);
      if (typeof max === "number") value = Math.min(value, max);
      const next: StatValue = { value, min };
      if (!connected && typeof max === "number") next.max = max;
      return next;
    }
    case "stack": {
      const max = connected ? current.max : "max" in patch ? patch.max : current.stored?.max;
      let value = Math.max(0, number(patch.value, number(current.value, 0)));
      if (typeof max === "number") value = Math.min(value, Math.max(0, max));
      const next: StatValue = { value };
      if (!connected && typeof max === "number") next.max = Math.max(0, max);
      return next;
    }
    case "rack": {
      const entry = matchRackEntry(stat.rack, patch.value) ?? current.stored?.value ?? stat.rack[0];
      return entry === undefined ? null : { value: entry };
    }
    case "computed":
      return null;
  }
}

/**
 * Changes one stat of one block at the table: a pool spent or refilled, a
 * stack counted, a rack moved, a display set. The value is clamped against
 * the definition (see clamped). Written in one UPDATE that merges the
 * system, group and stat levels with ||, so two stats changed at once do
 * not overwrite each other and a first change on an element with no block
 * creates the keys above it, which jsonb_set would not. The table is told,
 * as any change to an element is. The block comes back worked out.
 */
export async function sa_setElementStat(
  idStory: number,
  idElement: number,
  idSystem: number,
  group: string,
  stat: string,
  patch: StatPatch,
): Promise<SetElementStatResult> {
  const user = await requireAccount();
  const story = idSchema.parse(idStory);
  const element = idSchema.parse(idElement);
  const system = idSchema.parse(idSystem);
  const groupName = nameSchema.parse(group);
  const statName = nameSchema.parse(stat);
  const change = patchSchema.parse(patch);
  const gone = "That element is not one of your story's.";
  if (!(await ownsStory(user.id, story))) return { ok: false, error: gone };

  const found = await loadElement(story, element);
  if (!found) return { ok: false, error: gone };
  const systems = await statBlockSystems();
  const target = systems.find((candidate) => candidate.idSystem === system);
  if (!target) return { ok: false, error: "That system has no stats to fill in." };

  const key = systemKey(system);
  const block = found.blocks[key] ?? emptyStatBlock(target.definition);
  const next = clamped(target, groupName, statName, block, change);
  if (next === null) return { ok: false, error: "That stat is not one that can be set." };

  const [row] = await db
    .update(elements)
    .set({
      statBlocks: sql`${elements.statBlocks} || jsonb_build_object(${key}::text,
        coalesce(${elements.statBlocks} -> ${key}, '{}'::jsonb) || jsonb_build_object(${groupName}::text,
          coalesce(${elements.statBlocks} -> ${key} -> ${groupName}, '{}'::jsonb) || jsonb_build_object(${statName}::text, ${JSON.stringify(next)}::jsonb)))`,
      idUpdatedByUser: user.id,
    })
    .where(and(eq(elements.idElement, element), eq(elements.idStory, story)))
    .returning({ statBlocks: elements.statBlocks });
  if (!row) return { ok: false, error: gone };

  publishLater(() => publishElementChanged(story, element));
  return { ok: true, block: evaluated(target, readStatBlocks(row.statBlocks)[key], true) };
}
