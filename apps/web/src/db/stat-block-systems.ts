import { asc, eq, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { readStatBlockDefinition } from "@/lib/stat-block-schemas";
import { hasStats, type StatBlockSystem } from "@/lib/stat-blocks";
import { systemLabel } from "@/lib/stories";

const { stories, systems } = schema;

/**
 * Every system whose definition has a stat to fill in, with the definition
 * itself: the element form draws its cards from these, the actions check
 * the blocks against them, and the table reads an element's blocks through
 * them. Shared by the libraries and the stat block actions, which is why it
 * is here rather than in either. The definitions ride along rather than
 * being fetched one at a time, since few systems will have one and each is
 * bounded (lib/stat-block-schemas.ts). Read against the column with the
 * schema; a system whose definition does not parse is left out as if it
 * had none.
 *
 * Given a story, its own copy of its system's definition
 * (stories.stat_block_definition) stands in for that system's, so the
 * story's elements are filled in, checked and drawn against the copy while
 * every other story of the system keeps the system's. The story's system is
 * then listed for a copy with stats even when the system's own definition
 * has none. The caller has checked the story is one the user may read this
 * way; null reads the systems alone.
 */
export async function statBlockSystems(idStory: number | null): Promise<StatBlockSystem[]> {
  const copy = idStory === null ? null : await storyCopy(idStory);
  const hasGroups = sql`jsonb_array_length(${systems.statBlockDefinition} -> 'groups') > 0`;
  const rows = await db
    .select({
      idSystem: systems.idSystem,
      systemName: systems.systemName,
      systemVersion: systems.systemVersion,
      variant: systems.variant,
      statBlockDefinition: systems.statBlockDefinition,
    })
    .from(systems)
    .where(copy ? or(hasGroups, eq(systems.idSystem, copy.idSystem)) : hasGroups)
    .orderBy(asc(systems.systemName), asc(systems.systemVersion), asc(systems.variant));
  return rows
    .map((row) => ({
      idSystem: row.idSystem,
      label: systemLabel(row) ?? String(row.idSystem),
      definition: readStatBlockDefinition(
        row.idSystem === copy?.idSystem ? copy.definition : row.statBlockDefinition,
      ),
    }))
    .filter((system) => hasStats(system.definition));
}

/** The story's copy of its system's definition, raw, with the system it stands in for; null for none. */
async function storyCopy(
  idStory: number,
): Promise<{ idSystem: number; definition: unknown } | null> {
  const [row] = await db
    .select({ idSystem: stories.idSystem, definition: stories.statBlockDefinition })
    .from(stories)
    .where(eq(stories.idStory, idStory))
    .limit(1);
  // A copy with no system to stand in for is read by nothing: a story's
  // copy goes when its system changes (sa_updateStory), so this is only a
  // story whose system was taken off.
  if (!row || row.idSystem === null || row.definition === null) return null;
  return { idSystem: row.idSystem, definition: row.definition };
}
