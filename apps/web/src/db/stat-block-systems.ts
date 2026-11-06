import { asc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { readStatBlockDefinition } from "@/lib/stat-block-schemas";
import { hasStats, type StatBlockSystem } from "@/lib/stat-blocks";
import { systemLabel } from "@/lib/stories";

const { systems } = schema;

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
 */
export async function statBlockSystems(): Promise<StatBlockSystem[]> {
  const rows = await db
    .select({
      idSystem: systems.idSystem,
      systemName: systems.systemName,
      systemVersion: systems.systemVersion,
      variant: systems.variant,
      statBlockDefinition: systems.statBlockDefinition,
    })
    .from(systems)
    .where(sql`jsonb_array_length(${systems.statBlockDefinition} -> 'groups') > 0`)
    .orderBy(asc(systems.systemName), asc(systems.systemVersion), asc(systems.variant));
  return rows
    .map((row) => ({
      idSystem: row.idSystem,
      label: systemLabel(row) ?? String(row.idSystem),
      definition: readStatBlockDefinition(row.statBlockDefinition),
    }))
    .filter((system) => hasStats(system.definition));
}
