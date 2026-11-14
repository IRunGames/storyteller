"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAccount } from "@/lib/authorize";
import { readStatBlockDefinition, statBlockDefinitionSchema } from "@/lib/stat-block-schemas";
import { stampDefinition, type StatBlockDefinition } from "@/lib/stat-blocks";
import { systemLabel } from "@/lib/stories";

const { stories, systems } = schema;

// A story's stat block definition: its system's, which every story of the
// system shares, and the story's own copy of it, which the storyteller makes
// and changes on the story alone and which is read in the system's place
// wherever the story's elements are (db/stat-block-systems.ts). The story's
// page shows both; the copy is edited on this route's page.

const idStorySchema = z.int32();

const NOT_YOURS = "That story is not yours to change.";

/** What the story's page shows of its stat block. */
export type StoryStatBlockDefinition = {
  /** Whether the caller tells the story, and so may copy and change its definition. */
  isStoryteller: boolean;
  /** The story's system with its definition; null when the story has no system. */
  system: { idSystem: number; label: string; definition: StatBlockDefinition } | null;
  /** The story's own copy; null when it reads its system's. */
  copy: StatBlockDefinition | null;
};

export type CopyStatBlockDefinitionResult =
  { ok: true; copy: StatBlockDefinition } | { ok: false; error: string };

export type SetStoryStatBlockDefinitionResult =
  { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * The story's system's definition and the story's own copy, each read
 * through the schema. Anyone signed in may read them, as they may read the
 * page that shows them (sa_getStory); only the storyteller is told they may
 * change them. Null when there is no such story.
 */
export async function sa_getStoryStatBlockDefinition(
  idStory: number,
): Promise<StoryStatBlockDefinition | null> {
  const user = await requireAccount();
  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return null;

  const [row] = await db
    .select({
      owner: stories.idCreatedByUser,
      copy: stories.statBlockDefinition,
      idSystem: systems.idSystem,
      systemName: systems.systemName,
      systemVersion: systems.systemVersion,
      variant: systems.variant,
      definition: systems.statBlockDefinition,
    })
    .from(stories)
    .leftJoin(systems, eq(systems.idSystem, stories.idSystem))
    .where(eq(stories.idStory, id.data))
    .limit(1);
  if (!row) return null;
  return {
    isStoryteller: row.owner === user.id,
    system:
      row.idSystem === null
        ? null
        : {
            idSystem: row.idSystem,
            label: systemLabel(row) ?? String(row.idSystem),
            definition: readStatBlockDefinition(row.definition),
          },
    copy: row.copy === null ? null : readStatBlockDefinition(row.copy),
  };
}

/**
 * The story's page's Copy to this story, and its Overwrite with the game's
 * once there is a copy: the system's definition as it stands, written over
 * the story's copy whole and stamped as changed now, so the copy reads as
 * newer than what it was taken from until the system is changed again. The
 * storyteller's alone; a story with no system has nothing to copy. The new
 * copy comes back for the page to show.
 */
export async function sa_copySystemStatBlockDefinition(
  idStory: number,
): Promise<CopyStatBlockDefinitionResult> {
  const user = await requireAccount();
  const id = idStorySchema.parse(idStory);

  const [row] = await db
    .select({ owner: stories.idCreatedByUser, definition: systems.statBlockDefinition })
    .from(stories)
    .leftJoin(systems, eq(systems.idSystem, stories.idSystem))
    .where(eq(stories.idStory, id))
    .limit(1);
  if (!row || row.owner !== user.id) return { ok: false, error: NOT_YOURS };
  if (row.definition === null) {
    return { ok: false, error: "This story has no game system to copy from." };
  }

  const copy = stampDefinition(readStatBlockDefinition(row.definition));
  const updated = await db
    .update(stories)
    .set({ statBlockDefinition: copy, idUpdatedByUser: user.id })
    .where(and(eq(stories.idStory, id), eq(stories.idCreatedByUser, user.id)))
    .returning({ idStory: stories.idStory });
  if (updated.length === 0) return { ok: false, error: NOT_YOURS };
  return { ok: true, copy };
}

/**
 * Saves the editor's definition over the story's copy, whole, as the
 * Systems page saves a system's (sa_setSystemStatBlockDefinition): the same
 * schema, its rules coming back as field errors keyed by the issue's path,
 * and the same stamp. The storyteller's alone, and only for a story with a
 * system, since the copy is read in its system's place and stands in for
 * nothing without one.
 */
export async function sa_setStoryStatBlockDefinition(
  idStory: number,
  input: unknown,
): Promise<SetStoryStatBlockDefinitionResult> {
  const user = await requireAccount();
  const id = idStorySchema.parse(idStory);

  const [row] = await db
    .select({ owner: stories.idCreatedByUser, idSystem: stories.idSystem })
    .from(stories)
    .where(eq(stories.idStory, id))
    .limit(1);
  if (!row || row.owner !== user.id) return { ok: false, errors: { root: NOT_YOURS } };
  if (row.idSystem === null) {
    return { ok: false, errors: { root: "This story has no game system for a stat block." } };
  }

  const parsed = statBlockDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    return { ok: false, errors };
  }

  const updated = await db
    .update(stories)
    .set({ statBlockDefinition: stampDefinition(parsed.data), idUpdatedByUser: user.id })
    .where(and(eq(stories.idStory, id), eq(stories.idCreatedByUser, user.id)))
    .returning({ idStory: stories.idStory });
  if (updated.length === 0) return { ok: false, errors: { root: NOT_YOURS } };
  return { ok: true };
}
