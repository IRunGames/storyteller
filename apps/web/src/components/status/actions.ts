"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import {
  STATUS_TABLES,
  statusLabel,
  transitionsFrom,
  type StatusOption,
  type StatusTable,
} from "@/lib/status";

const { sStatuses, tablesMeta, stories, storyScenes, storySessions, elements, sceneElements } =
  schema;

// The status pill belongs to no one page — it sits on scenes, on sessions and
// on whatever gets a workflow next — so its actions live beside it rather
// than in a route's actions.ts.

// The table name arrives from the browser, so it is checked against the list
// of tables the pill is allowed to touch before it reaches a query. Anything
// else is not a table with a workflow, it is someone trying their luck.
const tableSchema = z.enum(STATUS_TABLES);

// Every one of these tables carries int4 keys, as story ids do: an id outside the range is a
// query error rather than a missing row, so it is refused up front.
const idSchema = z.number().int().min(-2147483648).max(2147483647);

// A status key is only ever compared against the workflow's own list, never
// interpolated, but a bound on the length keeps a runaway string out of the
// query altogether.
const statusSchema = z.string().min(1).max(64);

/**
 * The statuses of the workflow mapped to a table, in the order the workflow
 * lists them, which is the order the pill ramps its colour through. Read from
 * the metatables rather than restated here, so the moves the pill offers are
 * exactly the ones the database's transition trigger will accept.
 *
 * Any signed-in user may ask: a workflow's shape is not private, and a reader
 * who cannot change a status still sees its pill.
 */
export async function sa_listStatusOptions(table: StatusTable): Promise<StatusOption[]> {
  await requireUser();
  const name = tableSchema.parse(table);

  const rows = await db
    .select({
      key: sStatuses.statusKey,
      description: sStatuses.description,
      from: sStatuses.transitionFromStatusKeys,
    })
    .from(tablesMeta)
    .innerJoin(sStatuses, sql`${sStatuses.idStatusWorkflow} = any(${tablesMeta.idStatusWorkflows})`)
    .where(eq(tablesMeta.tableName, name))
    // s_status_id counts down from -1 in the order the seed lists them, so
    // descending is the workflow's own order: the first status first.
    .orderBy(desc(sStatuses.idStatus));

  // status_key is nullable on the metatable but a status without one is not a
  // status; it would only ever be a half-written seed row, so it is left out.
  return rows
    .filter((row): row is typeof row & { key: string } => row.key !== null)
    .map((row) => ({
      key: row.key,
      label: statusLabel(row.key),
      description: row.description,
      from: row.from,
    }));
}

export type SetStatusResult = { ok: true; status: string } | { ok: false; error: string };

/**
 * Move one row to a new status, taking effect at once. Only the storyteller
 * who owns the story the row belongs to may do it (currentStatus).
 *
 * The transition is checked against the workflow here and again by the
 * database's own trigger, which is the one that counts. A refusal comes back
 * as `ok: false` with something the pill can say, because there is nothing
 * the caller can fix by trying differently and nothing worth a thrown error.
 */
export async function sa_setRowStatus(
  table: StatusTable,
  id: number,
  status: string,
): Promise<SetStatusResult> {
  const user = await requireUser();
  const name = tableSchema.parse(table);
  const rowId = idSchema.parse(id);
  const next = statusSchema.parse(status);

  const options = await sa_listStatusOptions(name);
  if (!options.some((option) => option.key === next)) {
    return { ok: false, error: `${statusLabel(next)} is not a status of this workflow.` };
  }

  // The row as it stands: its current status, so the move can be checked, and
  // its story's creator, so the caller's right to make it can be. A row that
  // is not there and a row on someone else's story answer the same way; the
  // pill is only ever shown to the owner in the first place, so an intruder
  // learns nothing from the difference.
  const row = await currentStatus(name, rowId);
  if (!row || row.owner !== user.id) {
    return { ok: false, error: "That is not yours to change." };
  }
  if (row.status === next) return { ok: true, status: next };

  if (!transitionsFrom(row.status, options).some((option) => option.key === next)) {
    return {
      ok: false,
      error: `${statusLabel(row.status)} cannot move to ${statusLabel(next).toLowerCase()}.`,
    };
  }

  // The WHERE repeats the status the check was made against, so two people
  // moving the same row at once cannot both win: the second update matches
  // nothing and says so rather than overwriting a move it never saw.
  try {
    const updated = await moveRow(name, rowId, row.status, next, user.id);

    if (updated.length === 0) {
      return { ok: false, error: "That status changed while you were looking; try again." };
    }
    return { ok: true, status: updated[0].status };
  } catch {
    // The transition trigger raises rather than returns. Whatever it objected
    // to, the row is as it was, and the message it raises names database
    // internals, so the pill says the plain thing instead.
    return { ok: false, error: "The database refused that change." };
  }
}

/**
 * A row's status and its story's creator, or undefined when there is no such
 * row. Every table here hangs off a story, so every ownership check is a join
 * to it; a scene element reaches it through its scene.
 */
async function currentStatus(
  name: StatusTable,
  rowId: number,
): Promise<{ status: string; owner: string | null } | undefined> {
  switch (name) {
    case "story_scenes":
      return (
        await db
          .select({ status: storyScenes.status, owner: stories.idCreatedByUser })
          .from(storyScenes)
          .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
          .where(eq(storyScenes.idStoryScene, rowId))
          .limit(1)
      )[0];
    case "story_sessions":
      return (
        await db
          .select({ status: storySessions.status, owner: stories.idCreatedByUser })
          .from(storySessions)
          .innerJoin(stories, eq(stories.idStory, storySessions.idStory))
          .where(eq(storySessions.idStorySession, rowId))
          .limit(1)
      )[0];
    case "elements":
      return (
        await db
          .select({ status: elements.status, owner: stories.idCreatedByUser })
          .from(elements)
          .innerJoin(stories, eq(stories.idStory, elements.idStory))
          .where(eq(elements.idElement, rowId))
          .limit(1)
      )[0];
    case "scene_elements":
      return (
        await db
          .select({ status: sceneElements.status, owner: stories.idCreatedByUser })
          .from(sceneElements)
          .innerJoin(storyScenes, eq(storyScenes.idStoryScene, sceneElements.idStoryScene))
          .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
          .where(eq(sceneElements.idSceneElement, rowId))
          .limit(1)
      )[0];
  }
}

/**
 * Moves a row from `from` to `next`. The WHERE repeats `from`, so a row
 * someone else moved meanwhile matches nothing and the caller says so.
 */
async function moveRow(
  name: StatusTable,
  rowId: number,
  from: string,
  next: string,
  userId: string,
): Promise<{ status: string }[]> {
  const set = { status: next, idUpdatedByUser: userId };
  switch (name) {
    case "story_scenes":
      return db
        .update(storyScenes)
        .set(set)
        .where(and(eq(storyScenes.idStoryScene, rowId), eq(storyScenes.status, from)))
        .returning({ status: storyScenes.status });
    case "story_sessions":
      return db
        .update(storySessions)
        .set(set)
        .where(and(eq(storySessions.idStorySession, rowId), eq(storySessions.status, from)))
        .returning({ status: storySessions.status });
    case "elements":
      return db
        .update(elements)
        .set(set)
        .where(and(eq(elements.idElement, rowId), eq(elements.status, from)))
        .returning({ status: elements.status });
    case "scene_elements":
      return db
        .update(sceneElements)
        .set(set)
        .where(and(eq(sceneElements.idSceneElement, rowId), eq(sceneElements.status, from)))
        .returning({ status: sceneElements.status });
  }
}
