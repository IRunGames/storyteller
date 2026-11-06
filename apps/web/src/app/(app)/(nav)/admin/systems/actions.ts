"use server";

import { asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/authorize";
import { readStatBlockDefinition, statBlockDefinitionSchema } from "@/lib/stat-block-schemas";
import type { StatBlockDefinition } from "@/lib/stat-blocks";
import { systemLabel } from "@/lib/stories";
import { systemFieldsSchema } from "@/lib/system-schemas";

const { systems, stories, userSystems } = schema;

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

/** A system as its editor opens it: its own fields, and its definition. */
export type AdminSystemDetail = {
  idSystem: number;
  label: string;
  systemName: string;
  systemVersion: string | null;
  variant: string | null;
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
    systemName: row.systemName,
    systemVersion: row.systemVersion,
    variant: row.variant,
    definition: readStatBlockDefinition(row.statBlockDefinition),
  };
}

export type CreateSystemResult =
  { ok: true; system: AdminSystem } | { ok: false; errors: Record<string, string> };

/**
 * The New system dialog: a system from its name, version and variant, with
 * no definition yet; the row comes back as the list would show it so the
 * page can add it without reloading. The three together are unique in the
 * table (systems_name_version_variant_uindex, NULLS NOT DISTINCT), so a
 * second "Cypher System · Numenera (Revised)" inserts nothing, and the empty
 * returning is what says so; the message goes on the name, the field most
 * likely to be mistyped.
 */
export async function sa_createSystem(input: unknown): Promise<CreateSystemResult> {
  const admin = await requireAdmin();
  const parsed = systemFieldsSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    return { ok: false, errors };
  }

  const [row] = await db
    .insert(systems)
    .values({ ...parsed.data, idCreatedByUser: admin.id, idUpdatedByUser: admin.id })
    .onConflictDoNothing()
    .returning({ idSystem: systems.idSystem });
  const label = systemLabel(parsed.data) ?? parsed.data.systemName;
  if (!row) return { ok: false, errors: { systemName: `There is already a ${label}.` } };
  return { ok: true, system: { idSystem: row.idSystem, label, groupCount: 0, statCount: 0 } };
}

export type UpdateSystemResult =
  { ok: true; label: string } | { ok: false; errors: Record<string, string> };

/** The unique index on name, version and variant, which an update can hit where an insert does nothing. */
const isUniqueViolation = (error: unknown): boolean => {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
};

/**
 * The editor page's details form: a system's name, version and variant,
 * checked as the New system dialog's are. The three must stay unique
 * together; an insert that collides inserts nothing, but an update throws,
 * so the unique violation is caught and put on the name as the dialog's
 * refusal is. The label comes back so the page can show the new name.
 */
export async function sa_updateSystem(
  idSystem: number,
  input: unknown,
): Promise<UpdateSystemResult> {
  const admin = await requireAdmin();
  const id = idSystemSchema.safeParse(idSystem);
  if (!id.success) return { ok: false, errors: { root: "That system is no longer there." } };
  const parsed = systemFieldsSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    return { ok: false, errors };
  }

  const label = systemLabel(parsed.data) ?? parsed.data.systemName;
  let updated: { idSystem: number }[];
  try {
    updated = await db
      .update(systems)
      .set({ ...parsed.data, idUpdatedByUser: admin.id })
      .where(eq(systems.idSystem, id.data))
      .returning({ idSystem: systems.idSystem });
  } catch (error) {
    if (isUniqueViolation(error))
      return { ok: false, errors: { systemName: `There is already a ${label}.` } };
    throw error;
  }
  if (updated.length === 0)
    return { ok: false, errors: { root: "That system is no longer there." } };
  return { ok: true, label };
}

export type DeleteSystemResult = { ok: true } | { ok: false; error: string };

/**
 * The trashcan on a Systems row. A system a story is run in stays, since
 * stories.id_system has no foreign key to catch the orphan; one on
 * somebody's list of systems stays too, as user_systems' key would refuse
 * it anyway. Either refusal says how many, so the administrator knows what
 * would have to move first.
 */
export async function sa_deleteSystem(idSystem: number): Promise<DeleteSystemResult> {
  await requireAdmin();
  const id = idSystemSchema.safeParse(idSystem);
  if (!id.success) return { ok: false, error: "That system is no longer there." };

  const [[inStories], [onLists]] = await Promise.all([
    db.select({ n: count() }).from(stories).where(eq(stories.idSystem, id.data)),
    db.select({ n: count() }).from(userSystems).where(eq(userSystems.idSystem, id.data)),
  ]);
  if (inStories.n > 0) {
    const stories = inStories.n === 1 ? "1 story is" : `${inStories.n} stories are`;
    return { ok: false, error: `${stories} run in it, so it stays.` };
  }
  if (onLists.n > 0) {
    const people = onLists.n === 1 ? "1 person has" : `${onLists.n} people have`;
    return { ok: false, error: `${people} it among their systems, so it stays.` };
  }

  const gone = await db
    .delete(systems)
    .where(eq(systems.idSystem, id.data))
    .returning({ idSystem: systems.idSystem });
  if (gone.length === 0) return { ok: false, error: "That system is no longer there." };
  return { ok: true };
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
