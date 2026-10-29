"use server";

import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { elementOrderBy } from "@/db/element-order";
import { currentScene, sceneItems, type SceneItemRow } from "@/db/scene-items";
import { requireAccount } from "@/lib/authorize";
import {
  ELEMENT_KINDS,
  ELEMENT_SORT_KEYS,
  ELEMENTS_PAGE_SIZE,
  type ElementKind,
  type ElementSort,
  type StoryElement,
} from "@/lib/elements";
import { likeContains } from "@/lib/filter-text";
import { safeRedirect } from "@/lib/safe-redirect";
import { elementSchema } from "@/lib/element-schemas";
import { sceneSchema, type SceneValues } from "@/lib/scene-schemas";
import {
  SCENE_LOCKED_STATUS,
  SCENES_PAGE_SIZE,
  type SceneElementInfo,
  type SceneSessionOption,
  type StoryScene,
  type StorySceneDetail,
} from "@/lib/scenes";
import {
  DEFAULT_ELEMENT_SHOWING,
  isElementShowing,
  pillText,
  SCENE_ELEMENT_HIDDEN,
} from "@/lib/run";
import { publishLater } from "@/lib/realtime/publish";
import { publishElementChanged, publishSceneChanged } from "@/lib/realtime/publish-scene";
import { sessionHeading } from "@/lib/stories";

const { elements, stories, storyPlayers, storyScenes, storySessions, vStoryScenes } = schema;

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
const elementSortSchema = z.enum(ELEMENT_SORT_KEYS);

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

/** Whether the caller has a seat at the story, as one of its players. */
async function playsInStory(userId: string, idStory: number): Promise<boolean> {
  const [seat] = await db
    .select({ one: storyPlayers.idStoryPlayer })
    .from(storyPlayers)
    .where(and(eq(storyPlayers.idStory, idStory), eq(storyPlayers.idUser, userId)))
    .limit(1);
  return Boolean(seat);
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
  const user = await requireAccount();
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
  const user = await requireAccount();

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
 * A page of the story's elements of one kind, by name unless another of
 * ELEMENT_SORT_KEYS is asked for (elementOrderBy), optionally narrowed by
 * what that kind's search box holds and by the statuses still switched on
 * above it. The board gives each kind a column of its own; the run page's
 * library is what asks for another sort.
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
  sort: ElementSort = "name",
): Promise<StoryElement[]> {
  const user = await requireAccount();
  const ofKind = kindSchema.parse(kind);
  const skip = offsetSchema.parse(offset);
  const needle = querySchema.parse(query).trim();
  const order = elementSortSchema.parse(sort);
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
    .orderBy(...elementOrderBy(order))
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
  const user = await requireAccount();

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
  const user = await requireAccount();

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
      idStory: vStoryScenes.idStory,
      // The scene's picture is an attachments row now, not a column of the
      // view; the key keeps its name because it still holds a url to show.
      imageLink: attachmentUrl("STORY_SCENE", "v_story_scenes", "id_story_scene"),
      sessionNumber: vStoryScenes.sessionNumber,
      sessionTitle: vStoryScenes.sessionTitle,
      owner: stories.idCreatedByUser,
    })
    .from(vStoryScenes)
    .innerJoin(stories, eq(stories.idStory, vStoryScenes.idStory))
    .where(eq(vStoryScenes.idStoryScene, id.data))
    .limit(1);

  if (!row) return null;

  // The storyteller and the story's players may read a scene; anyone else
  // gets the same answer as for a scene that is not there. Only the
  // storyteller may change it, which the page and the panel learn from
  // isStoryteller.
  const isStoryteller = row.owner === user.id;
  if (!isStoryteller && !(await playsInStory(user.id, row.idStory!))) return null;

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
    idStory: row.idStory!,
    ...sessionOf(row),
    isStoryteller,
    elements: (
      await sceneItems(row.idStory!, row.idStoryScene!, isStoryteller ? [] : [SCENE_ELEMENT_HIDDEN])
    ).map((item) => sceneElementInfo(item, isStoryteller)),
  };
}

/**
 * An element of the scene as its info panel shows it (SceneElementInfo):
 * as written for the storyteller, and as the players' table labels it for a
 * player, the way toPlayItem does, with the description only while the
 * link's show_info allows it.
 */
function sceneElementInfo(
  { element, link }: SceneItemRow,
  isStoryteller: boolean,
): SceneElementInfo {
  const base = { idSceneElement: link.idSceneElement, kind: element.kind, status: link.status };
  if (isStoryteller) {
    return {
      ...base,
      label: element.name,
      detail: element.title || null,
      description: element.description,
    };
  }
  const showing = isElementShowing(link.elementShowing)
    ? link.elementShowing
    : DEFAULT_ELEMENT_SHOWING;
  const { label, detail } = pillText(
    { initial_name: element.initialName, name: element.name, title: element.title },
    showing,
  );
  return { ...base, label, detail, description: link.showInfo ? element.description : null };
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
  const user = await requireAccount();

  const id = idStorySchema.safeParse(idStory);
  if (!id.success) return [];
  if (!(await ownsStory(user.id, id.data))) return [];

  return sessionOptions(id.data);
}

export type SceneFormResult = { ok: false; errors: Record<string, string> };

/**
 * What a create action answers: ok once the row is in, so the board's dialog
 * can close and the column fetch it, or the errors for the form.
 */
export type CreateResult = { ok: true } | SceneFormResult;

// A form's answer to a submission the action refused: one message per field,
// the first issue winning, keyed by the issue's path. The scene and element
// forms both take it.
function formErrors(issues: { path: PropertyKey[]; message: string }[]): SceneFormResult {
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
  if (!parsed.success) return formErrors(parsed.error.issues);

  const { idStorySession } = parsed.data;
  if (idStorySession !== null) {
    const [session] = await db
      .select({ idStory: storySessions.idStory })
      .from(storySessions)
      .where(eq(storySessions.idStorySession, idStorySession))
      .limit(1);
    if (session?.idStory !== idStory) {
      return formErrors([
        { path: ["idStorySession"], message: "That session is not part of this story." },
      ]);
    }
  }
  return { values: parsed.data };
}

/**
 * Validates and adds a scene to a story the caller created, from the board's
 * New scene dialog. The status is left to the column default, the workflow's
 * first. Field errors come back for the form; ok means the dialog can close
 * and the Scenes column load the new scene.
 */
export async function sa_createStoryScene(idStory: number, input: unknown): Promise<CreateResult> {
  const user = await requireAccount();
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

  return { ok: true };
}

/**
 * A scene as the edit form holds it, with the story it belongs to and the
 * sittings that story has, or null when there is no such scene, the id is
 * unusable, or the caller is not its storyteller. `locked` is true for a
 * scene in SCENE_LOCKED_STATUS, which the form shows but will not save;
 * `status` is what the form's pill starts from.
 */
export async function sa_getStorySceneForEdit(idStoryScene: number): Promise<{
  idStory: number;
  status: string;
  locked: boolean;
  values: { title: string; description: string; idStorySession: number | null };
  sessions: SceneSessionOption[];
} | null> {
  const user = await requireAccount();

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
    status: row.status,
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
 * created, then goes back to the story's Prep Work board, or to `returnTo`
 * when the form was opened from somewhere else (a scene's preview): a path
 * of this site only, anything else being the board (safeRedirect). A scene
 * in SCENE_LOCKED_STATUS is refused: it has been played out, and the card
 * offers no edit for it. The status check is repeated in the UPDATE's WHERE,
 * so a scene completed between the read and the write is not overwritten.
 */
export async function sa_updateStoryScene(
  idStoryScene: number,
  input: unknown,
  returnTo?: string,
): Promise<SceneFormResult> {
  const user = await requireAccount();
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
    return formErrors([{ path: [], message: "A completed scene can no longer be edited." }]);
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
    return formErrors([{ path: [], message: "A completed scene can no longer be edited." }]);
  }

  redirect(safeRedirect(returnTo, `/libraries/${row.idStory}`));
}

export type DeleteSceneResult = { ok: true } | { ok: false; error: string };

/**
 * The board's Delete on a scene card: removes the scene from its story,
 * completed or not. A completed scene is the record of what was played, but
 * it is the storyteller's to take out; the card asks them first. The database
 * does the rest: a session that was on it is left on no scene
 * (story_sessions.id_story_scene is ON DELETE SET NULL), its links to
 * elements go (scene_elements.id_story_scene is ON DELETE CASCADE) while the
 * elements stay, and its uses of attachments go by trigger
 * (tr_ad_story_scenes_attachment_uses) while the files stay the story's.
 *
 * Refused for a scene that is not there or is on someone else's story,
 * alike, as sa_getStorySceneForEdit answers both with null.
 */
export async function sa_deleteStoryScene(idStoryScene: number): Promise<DeleteSceneResult> {
  const user = await requireAccount();
  const id = idStorySchema.safeParse(idStoryScene);
  const gone = "That scene is not one of your story's.";
  if (!id.success) return { ok: false, error: gone };

  const [row] = await db
    .select({ idStory: storyScenes.idStory, owner: stories.idCreatedByUser })
    .from(storyScenes)
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .where(eq(storyScenes.idStoryScene, id.data))
    .limit(1);
  if (!row || row.owner !== user.id) return { ok: false, error: gone };

  // Asked before the delete, since afterwards the session no longer names
  // the scene: a table playing it is told to reload onto no scene, and a
  // table elsewhere is told nothing, as with any other change to preparation.
  const wasCurrent = (await currentScene(row.idStory))?.idStoryScene === id.data;
  await db.delete(storyScenes).where(eq(storyScenes.idStoryScene, id.data));
  if (wasCurrent) publishLater(() => publishSceneChanged(row.idStory));
  return { ok: true };
}

export type ElementFormResult = SceneFormResult;

/**
 * Validates and adds an element to a story the caller created, from the
 * board's New element dialog. The status is left to the column default, the
 * workflow's first. Field errors come back for the form; ok means the dialog
 * can close and the element's kind column load it.
 */
export async function sa_createElement(idStory: number, input: unknown): Promise<CreateResult> {
  const user = await requireAccount();
  const id = idStorySchema.parse(idStory);
  if (!(await ownsStory(user.id, id))) {
    throw new Error("Only the storyteller who created a story can add elements to it");
  }

  const parsed = elementSchema.safeParse(input);
  if (!parsed.success) return formErrors(parsed.error.issues);

  const values = parsed.data;
  await db.insert(elements).values({
    idStory: id,
    kind: values.kind,
    name: values.name,
    initialName: values.initialName || null,
    title: values.title || null,
    description: values.description || null,
    notes: values.notes || null,
    url: values.url || null,
    urlText: values.urlText || null,
    idCreatedByUser: user.id,
    idUpdatedByUser: user.id,
  });

  return { ok: true };
}

/**
 * An element as the edit form holds it, with the story it belongs to, or null
 * when there is no such element, the id is unusable, or the caller is not its
 * storyteller. The nullable columns come back as "" for the inputs, as
 * sa_getStorySceneForEdit's do.
 */
export async function sa_getElementForEdit(idElement: number): Promise<{
  idStory: number;
  values: {
    kind: ElementKind;
    name: string;
    initialName: string;
    title: string;
    description: string;
    notes: string;
    url: string;
    urlText: string;
  };
} | null> {
  const user = await requireAccount();

  const id = idStorySchema.safeParse(idElement);
  if (!id.success) return null;

  const [row] = await db
    .select({
      idStory: elements.idStory,
      kind: elements.kind,
      name: elements.name,
      initialName: elements.initialName,
      title: elements.title,
      description: elements.description,
      notes: elements.notes,
      url: elements.url,
      urlText: elements.urlText,
      owner: stories.idCreatedByUser,
    })
    .from(elements)
    .innerJoin(stories, eq(stories.idStory, elements.idStory))
    .where(eq(elements.idElement, id.data))
    .limit(1);
  if (!row || row.owner !== user.id) return null;

  return {
    idStory: row.idStory,
    values: {
      // The column is the elements_kind enum, so it is always one of these.
      kind: kindSchema.parse(row.kind),
      name: row.name,
      initialName: row.initialName ?? "",
      title: row.title ?? "",
      description: row.description ?? "",
      notes: row.notes ?? "",
      url: row.url ?? "",
      urlText: row.urlText ?? "",
    },
  };
}

export type DeleteElementResult = { ok: true; idStory: number } | { ok: false; error: string };

/**
 * The edit page's Delete: removes an element from its story entirely. The
 * database takes its links to scenes with it (scene_elements.id_element is
 * ON DELETE CASCADE), so it leaves every scene's play space too. Its
 * picture is only pointed at (elements.id_attachment), so the attachment
 * stays in its story's or scene's list. The story comes back for the page
 * to go to its board.
 *
 * Refused for an element that is not there or is on someone else's story,
 * alike, as sa_getElementForEdit answers both with null.
 */
export async function sa_deleteElement(idElement: number): Promise<DeleteElementResult> {
  const user = await requireAccount();
  const id = idStorySchema.safeParse(idElement);
  const gone = "That element is not one of your story's.";
  if (!id.success) return { ok: false, error: gone };

  const [row] = await db
    .select({ idStory: elements.idStory, owner: stories.idCreatedByUser })
    .from(elements)
    .innerJoin(stories, eq(stories.idStory, elements.idStory))
    .where(eq(elements.idElement, id.data))
    .limit(1);
  if (!row || row.owner !== user.id) return { ok: false, error: gone };

  await db.delete(elements).where(eq(elements.idElement, id.data));
  // With the row gone, the players' table is told it is not in the current
  // scene, which is what publishElementChanged says of an element it cannot
  // find there.
  publishLater(() => publishElementChanged(row.idStory, id.data));
  return { ok: true, idStory: row.idStory };
}

/**
 * Validates and saves the edit form over an element on a story the caller
 * created, then goes back to the story's Prep Work board. The kind may
 * change, which moves the element to that kind's column.
 */
export async function sa_updateElement(
  idElement: number,
  input: unknown,
): Promise<ElementFormResult> {
  const user = await requireAccount();
  const id = idStorySchema.parse(idElement);

  const [row] = await db
    .select({ idStory: elements.idStory, owner: stories.idCreatedByUser })
    .from(elements)
    .innerJoin(stories, eq(stories.idStory, elements.idStory))
    .where(eq(elements.idElement, id))
    .limit(1);
  if (!row) throw new Error("Element not found");
  if (row.owner !== user.id) {
    throw new Error("Only the storyteller who created a story can edit its elements");
  }

  const parsed = elementSchema.safeParse(input);
  if (!parsed.success) return formErrors(parsed.error.issues);

  const values = parsed.data;
  await db
    .update(elements)
    .set({
      kind: values.kind,
      name: values.name,
      initialName: values.initialName || null,
      title: values.title || null,
      description: values.description || null,
      notes: values.notes || null,
      url: values.url || null,
      urlText: values.urlText || null,
      idUpdatedByUser: user.id,
    })
    .where(eq(elements.idElement, id));

  redirect(`/libraries/${row.idStory}`);
}
