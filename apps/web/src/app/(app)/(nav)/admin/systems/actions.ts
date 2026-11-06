"use server";

import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/authorize";
import { readStatBlockDefinition, statBlockDefinitionSchema } from "@/lib/stat-block-schemas";
import type { StatBlockDefinition } from "@/lib/stat-blocks";
import { systemLabel } from "@/lib/stories";

const { systems } = schema;

// The administrators' Systems page: every game system, and the stat block
// definition of each (lib/stat-blocks.ts). Every action here starts with
// requireAdmin(), as the Users page's do; the wrench that leads here is only
// drawn for an administrator, which decides nothing on its own.

/** One row of the Systems table. */
export type AdminSystem = {
  idSystem: number;
  /** "Cypher System · Numenera (Revised)", as a story card says it. */
  label: string;
  /** How much of a definition it has, for the table to say at a glance. */
  groupCount: number;
  statCount: number;
};

/** A system as its editor opens it. */
export type AdminSystemDetail = {
  idSystem: number;
  label: string;
  definition: StatBlockDefinition;
};

// As in stories/actions.ts: an id outside int4 is a query error rather than
// a missing row, so it is refused before it reaches Postgres.
const idSystemSchema = z.number().int().min(-2147483648).max(2147483647);

// The systems table is a hundred-odd seeded rows and whatever storytellers
// add; the page holds them all and filters in the browser, so there is no
// paging here, only a ceiling a runaway table could not pass.
const MAX_SYSTEMS = 500;

const groupCount = sql<number>`jsonb_array_length(${systems.statBlockDefinition} -> 'groups')`;
const statCount = sql<number>`(
  SELECT coalesce(sum(jsonb_array_length(g -> 'stats')), 0)
  FROM jsonb_array_elements(${systems.statBlockDefinition} -> 'groups') AS g
)`;

/** Every system, by name then version and variant, with the size of its definition. */
export async function sa_listAdminSystems(): Promise<AdminSystem[]> {
  await requireAdmin();
  const rows = await db
    .select({
      idSystem: systems.idSystem,
      systemName: systems.systemName,
      systemVersion: systems.systemVersion,
      variant: systems.variant,
      groupCount: groupCount.mapWith(Number),
      statCount: statCount.mapWith(Number),
    })
    .from(systems)
    .orderBy(
      asc(systems.systemName),
      asc(systems.systemVersion),
      asc(systems.variant),
      asc(systems.idSystem),
    )
    .limit(MAX_SYSTEMS);
  return rows.map((row) => ({
    idSystem: row.idSystem,
    label: systemLabel(row) ?? String(row.idSystem),
    groupCount: row.groupCount,
    statCount: row.statCount,
  }));
}

/** One system with its definition read through the schema, or null when there is no such row. */
export async function sa_getAdminSystem(idSystem: number): Promise<AdminSystemDetail | null> {
  await requireAdmin();
  const id = idSystemSchema.safeParse(idSystem);
  if (!id.success) return null;

  const [row] = await db
    .select({
      idSystem: systems.idSystem,
      systemName: systems.systemName,
      systemVersion: systems.systemVersion,
      variant: systems.variant,
      statBlockDefinition: systems.statBlockDefinition,
    })
    .from(systems)
    .where(eq(systems.idSystem, id.data))
    .limit(1);
  if (!row) return null;
  return {
    idSystem: row.idSystem,
    label: systemLabel(row) ?? String(row.idSystem),
    definition: readStatBlockDefinition(row.statBlockDefinition),
  };
}

export type SetDefinitionResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * Saves the editor's definition over a system, whole: the editor holds
 * every group and stat, so what it posts is what the column becomes. The
 * rules (names, references, cycles) come back as field errors keyed by the
 * issue's path, "groups.1.stats.0.computedAs", which is how the editor's
 * field arrays name their inputs. A system that is not there is refused on
 * root; there is nothing the editor could change about that.
 */
export async function sa_setSystemStatBlockDefinition(
  idSystem: number,
  input: unknown,
): Promise<SetDefinitionResult> {
  const admin = await requireAdmin();
  const id = idSystemSchema.parse(idSystem);

  const parsed = statBlockDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    return { ok: false, errors };
  }

  const updated = await db
    .update(systems)
    .set({ statBlockDefinition: parsed.data, idUpdatedByUser: admin.id })
    .where(eq(systems.idSystem, id))
    .returning({ idSystem: systems.idSystem });
  if (updated.length === 0)
    return { ok: false, errors: { root: "That system is no longer there." } };
  return { ok: true };
}
