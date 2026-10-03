"use server";

import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { requireUser } from "@/lib/authorize";
import {
  ELEMENT_KINDS,
  ELEMENTS_PAGE_SIZE,
  type ElementKind,
  type StoryElement,
} from "@/lib/elements";
import { likeContains } from "@/lib/filter-text";
import { sceneSchema, type SceneValues } from "@/lib/scene-schemas";
import {
  SCENE_LOCKED_STATUS,
  SCENES_PAGE_SIZE,
  type SceneSessionOption,
  type StoryScene,
  type StorySceneDetail,
} from "@/lib/scenes";
import { sessionHeading } from "@/lib/stories";

const { elements, stories, storyScenes, storySessions, vStoryScenes } = schema;

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

const kindSchema = z.enum(ELEMENT_KINDS);

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
      length: vStoryScenes.length,
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
    length: row.length,
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
 * A page of the story's elements of one kind, by name, optionally narrowed by
 * what that kind's search box holds and by the statuses still switched on
 * above it. The board gives each kind a column of its own.
 *
 * The search runs against elements.search_text, the generated column the
 * database builds from the element's status, names, title, description,
 * notes and tags, so a storyteller finds an element by words the card does
 * not show.
 */
export async function sa_listStoryElements(
  idStory: number,
  kind: ElementKind,
  offset: number,
  query: string = "",
  statuses?: string[],
): Promise<StoryElement[]> {
  const user = await requireUser();
  const ofKind = kindSchema.parse(kind);
  const skip = offsetSchema.parse(offset);
  const needle = querySchema.parse(query).trim();
  // As in sa_listStoryScenes: undefined is no filter, an empty list is none.
  const shown = statuses === undefined ? undefined : statusesSchema.parse(statuses);

  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return [];
  if (!(await ownsStory(user.id, id.data))) return [];
  if (shown?.length === 0) return [];

  return db
    .select({
      idElement: elements.idElement,
      status: elements.status,
      name: elements.name,
      title: elements.title,
      description: elements.description,
    })
    .from(elements)
    .where(
      and(
        eq(elements.idStory, id.data),
        eq(elements.kind, ofKind),
        needle === "" ? undefined : ilike(elements.searchText, likeContains(needle)),
        shown === undefined ? undefined : inArray(elements.status, shown),
      ),
    )
    .orderBy(asc(elements.name), asc(elements.idElement))
    .limit(ELEMENTS_PAGE_SIZE)
    .offset(skip);
}

/**
 * How many elements of each kind the story has, for the count beside each
 * kind's column heading; not narrowed by the search box, as
 * sa_countStoryScenes is not. A kind the story has none of counts zero.
 */
export async function sa_countStoryElements(idStory: number): Promise<Record<ElementKind, number>> {
  const counts = Object.fromEntries(ELEMENT_KINDS.map((kind) => [kind, 0])) as Record<
    ElementKind,
    number
  >;
  const user = await requireUser();

  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return counts;
  if (!(await ownsStory(user.id, id.data))) return counts;

  const rows = await db
    .select({ kind: elements.kind, count: sql<number>`count(*)`.mapWith(Number) })
    .from(elements)
    .where(eq(elements.idStory, id.data))
    .groupBy(elements.kind);
  for (const row of rows) {
    const kind = kindSchema.safeParse(row.kind);
    if (kind.success) counts[kind.data] = row.count;
  }
  return counts;
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
      length: vStoryScenes.length,
      title: vStoryScenes.sceneTitle,
      description: vStoryScenes.sceneDescription,
      startedAt: vStoryScenes.activeAt,
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
    length: row.length,
    title: row.title!,
    description: row.description,
    imageLink: row.imageLink,
    startedAt: row.startedAt,
    ...sessionOf(row),
  };
}

/**
 * The story's sittings, oldest first, as the scene form's select offers
 * them. Numbered by their place in that order, which is how the Timeline
 * numbers them, so "3. Kildealg" means the same sitting in both places.
 */
async function sessionOptions(idStory: number): Promise<SceneSessionOption[]> {
  const rows = await db
    .select({ idStorySession: storySessions.idStorySession, title: storySessions.title })
    .from(storySessions)
    .where(eq(storySessions.idStory, idStory))
    .orderBy(asc(storySessions.createdAt), asc(storySessions.idStorySession));
  return rows.map((row, index) => ({
    idStorySession: row.idStorySession,
    label: sessionHeading({ number: index + 1, title: row.title }),
  }));
}

/** The sittings a scene of this story may be put in; nothing for anyone but its storyteller. */
export async function sa_listSceneSessionOptions(idStory: number): Promise<SceneSessionOption[]> {
  const user = await requireUser();

  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return [];
  if (!(await ownsStory(user.id, id.data))) return [];

  return sessionOptions(id.data);
}

export type SceneFormResult = { ok: false; errors: Record<string, string> };

// The form's answer to a submission the action refused: one message per
// field, the first issue winning, keyed by the issue's path.
function sceneErrors(issues: { path: PropertyKey[]; message: string }[]): SceneFormResult {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    errors[issue.path.join(".")] ??= issue.message;
  }
  return { ok: false, errors };
}

/**
 * Parses the form, and checks that the sitting it names, if any, is one of
 * this story's: the select only offers those, but the id comes from the
 * browser like everything else.
 */
async function parseScene(
  idStory: number,
  input: unknown,
): Promise<{ values: SceneValues } | SceneFormResult> {
  const parsed = sceneSchema.safeParse(input);
  if (!parsed.success) return sceneErrors(parsed.error.issues);

  const { idStorySession } = parsed.data;
  if (idStorySession !== null) {
    const [session] = await db
      .select({ idStory: storySessions.idStory })
      .from(storySessions)
      .where(eq(storySessions.idStorySession, idStorySession))
      .limit(1);
    if (session?.idStory !== idStory) {
      return sceneErrors([
        { path: ["idStorySession"], message: "That session is not part of this story." },
      ]);
    }
  }
  return { values: parsed.data };
}

/**
 * Validates and adds a scene to a story the caller created, then goes back to
 * the story's Prep Work board, where the new scene waits in its column. The
 * status is left to the column default, the workflow's first. Field errors
 * come back for the form; on success the redirect throws, so this never
 * resolves with ok: true.
 */
export async function sa_createStoryScene(
  idStory: number,
  input: unknown,
): Promise<SceneFormResult> {
  const user = await requireUser();
  const id = idStorySchema.parse(idStory);
  if (!(await ownsStory(user.id, id))) {
    throw new Error("Only the storyteller who created a story can add scenes to it");
  }

  const parsed = await parseScene(id, input);
  if (!("values" in parsed)) return parsed;

  const { values } = parsed;
  await db.insert(storyScenes).values({
    idStory: id,
    sceneTitle: values.title,
    sceneDescription: values.description || null,
    idStorySession: values.idStorySession,
    idCreatedByUser: user.id,
    idUpdatedByUser: user.id,
  });

  redirect(`/libraries/${id}`);
}

/**
 * A scene as the edit form holds it, with the story it belongs to and the
 * sittings that story has, or null when there is no such scene, the id is
 * unusable, or the caller is not its storyteller. `locked` is true for a
 * scene in SCENE_LOCKED_STATUS, which the form shows but will not save.
 */
export async function sa_getStorySceneForEdit(idStoryScene: number): Promise<{
  idStory: number;
  locked: boolean;
  values: { title: string; description: string; idStorySession: number | null };
  sessions: SceneSessionOption[];
} | null> {
  const user = await requireUser();

  const id = idStorySchema.safeParse(idStoryScene);
  if (!id.success) return null;

  const [row] = await db
    .select({
      idStory: storyScenes.idStory,
      status: storyScenes.status,
      title: storyScenes.sceneTitle,
      description: storyScenes.sceneDescription,
      idStorySession: storyScenes.idStorySession,
      owner: stories.idCreatedByUser,
    })
    .from(storyScenes)
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .where(eq(storyScenes.idStoryScene, id.data))
    .limit(1);
  if (!row || row.owner !== user.id) return null;

  return {
    idStory: row.idStory,
    locked: row.status === SCENE_LOCKED_STATUS,
    // "" rather than null for the textarea, as sa_getStoryForEdit does.
    values: {
      title: row.title,
      description: row.description ?? "",
      idStorySession: row.idStorySession,
    },
    sessions: await sessionOptions(row.idStory),
  };
}

/**
 * Validates and saves the edit form over a scene on a story the caller
 * created, then goes back to the story's Prep Work board. A scene in
 * SCENE_LOCKED_STATUS is refused: it has been played out, and the card
 * offers no edit for it. The status check is repeated in the UPDATE's WHERE,
 * so a scene completed between the read and the write is not overwritten.
 */
export async function sa_updateStoryScene(
  idStoryScene: number,
  input: unknown,
): Promise<SceneFormResult> {
  const user = await requireUser();
  const id = idStorySchema.parse(idStoryScene);

  const [row] = await db
    .select({
      idStory: storyScenes.idStory,
      status: storyScenes.status,
      owner: stories.idCreatedByUser,
    })
    .from(storyScenes)
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .where(eq(storyScenes.idStoryScene, id))
    .limit(1);
  if (!row) throw new Error("Scene not found");
  if (row.owner !== user.id) {
    throw new Error("Only the storyteller who created a story can edit its scenes");
  }
  if (row.status === SCENE_LOCKED_STATUS) {
    return sceneErrors([{ path: [], message: "A completed scene can no longer be edited." }]);
  }

  const parsed = await parseScene(row.idStory, input);
  if (!("values" in parsed)) return parsed;

  const { values } = parsed;
  const updated = await db
    .update(storyScenes)
    .set({
      sceneTitle: values.title,
      sceneDescription: values.description || null,
      idStorySession: values.idStorySession,
      idUpdatedByUser: user.id,
    })
    .where(
      and(eq(storyScenes.idStoryScene, id), sql`${storyScenes.status} <> ${SCENE_LOCKED_STATUS}`),
    )
    .returning({ idStoryScene: storyScenes.idStoryScene });
  if (updated.length === 0) {
    return sceneErrors([{ path: [], message: "A completed scene can no longer be edited." }]);
  }

  redirect(`/libraries/${row.idStory}`);
}
