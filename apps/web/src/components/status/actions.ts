"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { idSchema } from "@/lib/schemas";
import { SCENE_LOCKED_STATUS, SESSION_STATUS } from "@/lib/status";
import { db, schema } from "@/db";
import { listStatusOptions } from "@/db/status-options";
import { requireAccount } from "@/lib/authorize";
import { isTransitionRefusal } from "@/lib/db-errors";
import { SCENE_COMPLETE } from "@/lib/messages";
import { removeGuestsFrom } from "@/lib/guests";
import { publishLater } from "@/lib/realtime/publish";
import {
  publishElementChanged,
  publishSceneChanged,
  publishSceneElement,
} from "@/lib/realtime/publish-scene";
import {
  STATUS_TABLES,
  statusLabel,
  transitionsFrom,
  type StatusOption,
  type StatusTable,
} from "@/lib/status";

const { stories, storyScenes, storySessions, elements, sceneElements } = schema;

// The status pill belongs to no one page — it sits on scenes, on sessions and
// on whatever gets a workflow next — so its actions live beside it rather
// than in a route's actions.ts.

// The table name arrives from the browser, so it is checked against the list
// of tables the pill is allowed to touch before it reaches a query. Anything
// else is not a table with a workflow, it is someone trying their luck.
const tableSchema = z.enum(STATUS_TABLES);

// A status key is only ever compared against the workflow's own list, never
// interpolated, but a bound on the length keeps a runaway string out of the
// query altogether.
const statusSchema = z.string().min(1).max(64);

/**
 * The statuses of the workflow mapped to a table, in the order the workflow
 * lists them (db/status-options.ts says how they are read), so the moves
 * the pill offers are exactly the ones the database's transition trigger
 * will accept.
 *
 * Any signed-in user may ask: a workflow's shape is not private, and a reader
 * who cannot change a status still sees its pill.
 */
export async function sa_listStatusOptions(table: StatusTable): Promise<StatusOption[]> {
  await requireAccount();
  const name = tableSchema.safeParse(table);
  return name.success ? listStatusOptions(name.data) : [];
}

export type SetStatusResult = { ok: true; status: string } | { ok: false; error: string };

// What the pill asks for, held to the tables and lengths above before any
// of it reaches a query.
const moveSchema = z.object({ table: tableSchema, id: idSchema, status: statusSchema });

/**
 * Move one row to a new status, taking effect at once. Only the storyteller
 * who owns the story the row belongs to may do it (currentStatus), and a
 * scene element's pill is held to its scene's lock: a complete scene is the
 * record of what was played, so the standing of what is in it does not
 * change either (SCENE_LOCKED_STATUS, as every other write to a link is
 * held by db/story-access.ts).
 *
 * The transition is checked against the workflow here and again by the
 * database's own trigger, which is the one that counts. A refusal comes back
 * as `ok: false` with something the pill can say, because there is nothing
 * the caller can fix by trying differently and nothing worth a thrown error;
 * a request that is not one at all answers the same way.
 */
export async function sa_setRowStatus(
  table: StatusTable,
  id: number,
  status: string,
): Promise<SetStatusResult> {
  const user = await requireAccount();
  const asked = moveSchema.safeParse({ table, id, status });
  if (!asked.success) return { ok: false, error: "That is not yours to change." };
  const { table: name, id: rowId, status: next } = asked.data;

  const options = await listStatusOptions(name);
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
  if (row.sceneStatus === SCENE_LOCKED_STATUS) return { ok: false, error: SCENE_COMPLETE };
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
    // A guest's seat was for that sitting: once it is over they have
    // nothing left to come back to, so every guest seated at the story goes,
    // and a guest seated nowhere else is deleted. Before the publish, so a
    // guest's table reloading on the news finds itself signed out. The
    // session has ended either way, so a failure here is logged rather than
    // reported as the move failing; the daily sweep (api/cron/guest-sweep)
    // takes the guests once their sessions run out.
    if (name === "story_sessions" && next === SESSION_STATUS.DONE) {
      await removeGuestsFrom(row.idStory).catch((error: unknown) =>
        console.error("Could not remove the guests of a finished session", rowId, error),
      );
    }
    publishLater(() => publishStatusChange(name, rowId, row));
    return { ok: true, status: updated[0].status };
  } catch (error) {
    // The transition trigger raises rather than returns. Whatever it objected
    // to, the row is as it was, and the message it raises names database
    // internals, so the pill says the plain thing instead. Only that refusal
    // is answered for: a lost connection or a bug is still an error.
    if (!isTransitionRefusal(error)) throw error;
    return { ok: false, error: "The database refused that change." };
  }
}

/** A row as sa_setRowStatus reads it before the move, with where it hangs off its story. */
type StatusRow = {
  status: string;
  owner: string | null;
  idStory: number;
  /** A scene element's scene, for telling the players which scene's pill moved. */
  idStoryScene?: number;
  /** A scene element's scene's status, which locks the link once the scene is complete. */
  sceneStatus?: string;
};

/**
 * A row's status and its story's creator, or undefined when there is no such
 * row. Every table here hangs off a story, so every ownership check is a join
 * to it; a scene element reaches it through its scene.
 */
async function currentStatus(name: StatusTable, rowId: number): Promise<StatusRow | undefined> {
  switch (name) {
    case "story_scenes":
      return (
        await db
          .select({
            status: storyScenes.status,
            owner: stories.idCreatedByUser,
            idStory: stories.idStory,
          })
          .from(storyScenes)
          .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
          .where(eq(storyScenes.idStoryScene, rowId))
          .limit(1)
      )[0];
    case "story_sessions":
      return (
        await db
          .select({
            status: storySessions.status,
            owner: stories.idCreatedByUser,
            idStory: stories.idStory,
          })
          .from(storySessions)
          .innerJoin(stories, eq(stories.idStory, storySessions.idStory))
          .where(eq(storySessions.idStorySession, rowId))
          .limit(1)
      )[0];
    case "elements":
      return (
        await db
          .select({
            status: elements.status,
            owner: stories.idCreatedByUser,
            idStory: stories.idStory,
          })
          .from(elements)
          .innerJoin(stories, eq(stories.idStory, elements.idStory))
          .where(eq(elements.idElement, rowId))
          .limit(1)
      )[0];
    case "scene_elements":
      return (
        await db
          .select({
            status: sceneElements.status,
            owner: stories.idCreatedByUser,
            idStory: stories.idStory,
            idStoryScene: sceneElements.idStoryScene,
            sceneStatus: storyScenes.status,
          })
          .from(sceneElements)
          .innerJoin(storyScenes, eq(storyScenes.idStoryScene, sceneElements.idStoryScene))
          .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
          .where(eq(sceneElements.idSceneElement, rowId))
          .limit(1)
      )[0];
  }
}

/**
 * Tells the players' table about a move, by what moved: a scene or a
 * session changing status changes what the table shows whole (a scene
 * finished, a session ended), while an element or a link is sent as it now
 * is. See lib/realtime/publish-scene.ts for what each sends.
 */
async function publishStatusChange(name: StatusTable, rowId: number, row: StatusRow) {
  switch (name) {
    case "story_scenes":
    case "story_sessions":
      return publishSceneChanged(row.idStory);
    case "elements":
      return publishElementChanged(row.idStory, rowId);
    case "scene_elements":
      // The link by its own id, rowId, which is what the table draws a pill
      // by; an element may be in the scene more than once.
      if (row.idStoryScene === undefined) return;
      return publishSceneElement(row.idStory, row.idStoryScene, rowId);
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
