"use server";

import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { requireUser } from "@/lib/authorize";
import { likeContains } from "@/lib/filter-text";
import { SCENES_PAGE_SIZE, type StoryScene, type StorySceneDetail } from "@/lib/scenes";
import { sessionHeading } from "@/lib/stories";

const { stories, storyScenes, vStoryScenes } = schema;

// The Prep Work board's own reads. The board is the storyteller's working
// material, so every one of these proves the caller owns the story before it
// answers, rather than leaning on the page having done it.

const offsetSchema = z.number().int().min(0);
const querySchema = z.string().max(200);

// The statuses a column is showing. They are compared against the rows, never
// interpolated, but a bound keeps a runaway list out of the query; a workflow
// with more statuses than this is not a workflow.
const statusesSchema = z.array(z.string().min(1).max(64)).max(50);

// As in stories/actions.ts: an id outside int4 is a query error rather than a
// missing row, so it is refused before it reaches Postgres.
const idStorySchema = z.number().int().min(-2147483648).max(2147483647);

/**
 * Whether the caller is the storyteller who created the story. The board and
 * everything on it is theirs alone — scenes are what the players are not
 * meant to see yet — so a story that is not there and a story that is
 * someone else's are the same answer.
 */
async function ownsStory(userId: string, idStory: number): Promise<boolean> {
  const [story] = await db
    .select({ owner: stories.idCreatedByUser })
    .from(stories)
    .where(eq(stories.idStory, idStory))
    .limit(1);
  return story?.owner === userId;
}

/**
 * The sitting a scene was played in, as a card and a panel both want it: the
 * number on its own, and the heading the Timeline would give it. Null on both
 * counts for a scene still waiting on the board, and for the row of a session
 * the view could not number, which would only happen mid-delete.
 */
function sessionOf(row: {
  idStorySession: number | null;
  sessionNumber: number | null;
  sessionTitle: string | null;
}): { sessionNumber: number | null; sessionHeading: string | null } {
  if (row.idStorySession === null || row.sessionNumber === null) {
    return { sessionNumber: null, sessionHeading: null };
  }
  return {
    sessionNumber: row.sessionNumber,
    sessionHeading: sessionHeading({ number: row.sessionNumber, title: row.sessionTitle }),
  };
}

/**
 * A page of the story's scenes, newest first, optionally narrowed by what the
 * Scenes search box holds.
 *
 * The search runs against story_scenes.search_text, the generated column the
 * database builds from the scene's status, title and description, so a
 * storyteller finds a scene by any of the three and by words the row holds
 * but the card does not show. It is a database search rather than a filter
 * over the rows already loaded, which would only ever search the first page.
 */
export async function sa_listStoryScenes(
  idStory: number,
  offset: number,
  query: string = "",
  statuses?: string[],
): Promise<StoryScene[]> {
  const user = await requireUser();
  const skip = offsetSchema.parse(offset);
  const needle = querySchema.parse(query).trim();
  // Undefined is "no such filter", which is not the same as an empty list:
  // every status switched off above the search box asks for nothing, and
  // gets nothing.
  const shown = statuses === undefined ? undefined : statusesSchema.parse(statuses);

  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return [];
  if (!(await ownsStory(user.id, id.data))) return [];
  if (shown?.length === 0) return [];

  const matchesStory = eq(vStoryScenes.idStory, id.data);
  const rows = await db
    .select({
      idStoryScene: vStoryScenes.idStoryScene,
      idStorySession: vStoryScenes.idStorySession,
      status: vStoryScenes.status,
      statusAt: vStoryScenes.statusAt,
      sceneNumber: vStoryScenes.sceneNumber,
      title: vStoryScenes.sceneTitle,
      description: vStoryScenes.sceneDescription,
      sessionNumber: vStoryScenes.sessionNumber,
      sessionTitle: vStoryScenes.sessionTitle,
    })
    .from(vStoryScenes)
    .where(
      and(
        matchesStory,
        needle === "" ? undefined : ilike(vStoryScenes.searchText, likeContains(needle)),
        shown === undefined ? undefined : inArray(vStoryScenes.status, shown),
      ),
    )
    // Grouped by the sitting each scene belongs to, most recently touched
    // first, and a scene not yet in one comes before them all: it is the prep
    // still to be done, and Postgres sorts nulls first on a descending column
    // without being asked. Within a sitting, the workflow's own order — the
    // seed numbers statuses downwards, so descending runs from the status a
    // scene starts in to the one it ends in — and then the scene's own
    // updated_at, newest first, to break the remaining ties stably.
    .orderBy(
      desc(vStoryScenes.sessionUpdatedAt),
      desc(vStoryScenes.idStatus),
      desc(vStoryScenes.updatedAt),
      desc(vStoryScenes.idStoryScene),
    )
    .limit(SCENES_PAGE_SIZE)
    .offset(skip);

  return rows.map((row) => ({
    idStoryScene: row.idStoryScene!,
    idStorySession: row.idStorySession,
    status: row.status!,
    statusAt: row.statusAt,
    sceneNumber: row.sceneNumber,
    title: row.title!,
    description: row.description,
    ...sessionOf(row),
  }));
}

/**
 * How many scenes the story has in all, for the count beside the Scenes
 * heading. Deliberately not narrowed by the search box: the heading says how
 * big the column is, not how much of it a query happens to match.
 */
export async function sa_countStoryScenes(idStory: number): Promise<number> {
  const user = await requireUser();

  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return 0;
  if (!(await ownsStory(user.id, id.data))) return 0;

  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(storyScenes)
    .where(eq(storyScenes.idStory, id.data));
  return row?.count ?? 0;
}

/**
 * One scene as its info panel shows it, or null when there is no such scene,
 * the id is unusable, or the caller is not the storyteller whose story it
 * belongs to. Everything the row holds: what the storyteller wrote, the
 * picture, and which sitting it was played in.
 *
 * The session is named the way the Timeline names it, counted in the same
 * opening order, so the two columns of the board agree on what session three
 * is.
 */
export async function sa_getStoryScene(idStoryScene: number): Promise<StorySceneDetail | null> {
  const user = await requireUser();

  const id = idStorySchema.safeParse(idStoryScene);
  if (!id.success) return null;

  const [row] = await db
    .select({
      idStoryScene: vStoryScenes.idStoryScene,
      idStorySession: vStoryScenes.idStorySession,
      status: vStoryScenes.status,
      statusAt: vStoryScenes.statusAt,
      sceneNumber: vStoryScenes.sceneNumber,
      title: vStoryScenes.sceneTitle,
      description: vStoryScenes.sceneDescription,
      // The scene's picture is an attachments row now, not a column of the
      // view; the key keeps its name because it still holds a url to show.
      imageLink: attachmentUrl("STORY_SCENE", vStoryScenes.idStoryScene),
      sessionNumber: vStoryScenes.sessionNumber,
      sessionTitle: vStoryScenes.sessionTitle,
      owner: stories.idCreatedByUser,
    })
    .from(vStoryScenes)
    .innerJoin(stories, eq(stories.idStory, vStoryScenes.idStory))
    .where(eq(vStoryScenes.idStoryScene, id.data))
    .limit(1);

  // A scene on someone else's story answers the same as one that is not
  // there: the board is the storyteller's alone.
  if (!row || row.owner !== user.id) return null;

  return {
    idStoryScene: row.idStoryScene!,
    idStorySession: row.idStorySession,
    status: row.status!,
    statusAt: row.statusAt,
    sceneNumber: row.sceneNumber,
    title: row.title!,
    description: row.description,
    imageLink: row.imageLink,
    ...sessionOf(row),
  };
}
