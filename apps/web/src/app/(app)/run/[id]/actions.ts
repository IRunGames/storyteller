"use server";

import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentUrl } from "@/db/attachment-url";
import { requireUser } from "@/lib/authorize";
import { runElementSchema, type RunElementValues } from "@/lib/element-schemas";
import { sa_listStatusOptions } from "@/components/status/actions";
import { ELEMENT_KINDS, isElementKind } from "@/lib/elements";
import {
  EMPTY_PLAY_SPACE,
  RUN_SCENES_LIST_SIZE,
  SCENE_ELEMENT_DISABLED,
  SCENE_ELEMENT_HIDDEN,
  SCENE_ELEMENT_SHOWN,
  type PlayItem,
  type RunPlaySpace,
  type RunScene,
  type SceneElementDetail,
} from "@/lib/run";
import { runSceneSchema } from "@/lib/scene-schemas";

const { elements, sceneElements, stories, storyScenes, storySessions, vSceneElements } = schema;

// The same int4 range as everywhere a story or scene id comes in.
const idSchema = z.number().int().min(-2147483648).max(2147483647);

// The session statuses in which a session is being played, the same two
// hasOpenSession reads; see db/open-session.ts for why they are named here.
const PLAYING = ["OPEN", "RESUMED"];

// The scene status a scene is in while it is being played. The table moves
// a scene to it when the storyteller chooses it; the workflow lets every
// status reach it.
const ACTIVE = "ACTIVE";

const EMPTY = EMPTY_PLAY_SPACE;

const NO_SESSION = "Start a session before choosing a scene.";
const NOT_THIS_STORY = "That scene is not part of this story.";
const NOT_THIS_STORYS_ELEMENT = "That element is not part of this story.";
const NOT_IN_THIS_SCENE = "That element is not in this scene.";
const NO_SUCH_STACK = "That stack is no longer one of the scene's tags.";

// A stack's tag as the + form sends it: one of the scene's tags, or null
// for the Default stack of a scene with none.
const stackTagSchema = z.string().trim().min(1).max(200).nullable();

/**
 * The session being played at a story the caller tells, or null: when the
 * story is someone else's, when it has no current session, or when that
 * session is paused or finished.
 */
async function playingSession(userId: string, idStory: number): Promise<number | null> {
  const [row] = await db
    .select({ idStorySession: storySessions.idStorySession })
    .from(stories)
    .innerJoin(storySessions, eq(storySessions.idStorySession, stories.idStorySession))
    .where(
      and(
        eq(stories.idStory, idStory),
        eq(stories.idCreatedByUser, userId),
        inArray(storySessions.status, PLAYING),
      ),
    )
    .limit(1);
  return row?.idStorySession ?? null;
}

/** Whether the caller is the storyteller who created the story. */
async function ownsStory(userId: string, idStory: number): Promise<boolean> {
  const [row] = await db
    .select({ owner: stories.idCreatedByUser })
    .from(stories)
    .where(eq(stories.idStory, idStory))
    .limit(1);
  return row?.owner === userId;
}

/**
 * The play space for one scene of the story: its tags and cover, and the
 * elements brought into it (scene_elements) in the kinds' order, People to
 * Ephemera, as the library tabs list them, and by name within a kind. The
 * elements' keys are the library's own, so one already here cannot be added
 * again from the library.
 */
async function spaceFor(idStory: number, idStoryScene: number): Promise<RunPlaySpace> {
  const [scene] = await db
    .select({
      idStoryScene: storyScenes.idStoryScene,
      title: storyScenes.sceneTitle,
      status: storyScenes.status,
      tags: storyScenes.tags,
      coverUrl: attachmentUrl("STORY_SCENE", storyScenes.idStoryScene),
    })
    .from(storyScenes)
    .where(and(eq(storyScenes.idStoryScene, idStoryScene), eq(storyScenes.idStory, idStory)))
    .limit(1);
  if (!scene) return EMPTY;

  const rows = await db
    .select({
      idElement: vSceneElements.idElement,
      kind: vSceneElements.kind,
      name: vSceneElements.name,
      initialName: vSceneElements.initialName,
      title: vSceneElements.title,
      tags: vSceneElements.tags,
      status: vSceneElements.status,
    })
    .from(vSceneElements)
    .where(
      and(
        eq(vSceneElements.idStoryScene, scene.idStoryScene),
        // Nothing in the database holds a link's element to the scene's
        // story, so a link to another story's element is not this scene's.
        eq(vSceneElements.idStory, idStory),
      ),
    )
    .orderBy(asc(vSceneElements.name), asc(vSceneElements.idElement));

  const order = (kind: string) => ELEMENT_KINDS.indexOf(kind as (typeof ELEMENT_KINDS)[number]);
  const linked = rows
    .filter((row) => isElementKind(row.kind) && row.idElement !== null && row.name !== null)
    .sort((a, b) => order(a.kind!) - order(b.kind!))
    .map((row) =>
      linkedItem({
        idElement: row.idElement!,
        kind: row.kind!,
        name: row.name!,
        initialName: row.initialName,
        title: row.title,
        tags: row.tags ?? [],
        status: row.status ?? "",
      }),
    );

  return {
    scene: { idStoryScene: scene.idStoryScene, title: scene.title, status: scene.status },
    tags: scene.tags,
    coverUrl: scene.coverUrl,
    inPlay: linked,
  };
}

/**
 * An element linked to the scene, as the play space holds it. The pill is
 * labelled with the element's initial name, the name it goes by when it
 * first turns up, and only falls back to its name when it has none; the
 * name proper is in the pill's info popover.
 */
function linkedItem(row: {
  idElement: number;
  kind: string;
  name: string;
  initialName: string | null;
  title: string | null;
  tags: string[];
  status: string;
}): PlayItem {
  return {
    key: `${row.kind}:${row.idElement}`,
    kind: row.kind as PlayItem["kind"],
    label: row.initialName || row.name,
    detail: row.title,
    imageUrl: null,
    sceneTags: row.tags,
    sceneStatus: row.status,
    ...(row.initialName && row.initialName !== row.name ? { realName: row.name } : {}),
  };
}

/**
 * The scene's tags when it is a scene of this story told by the caller, or
 * null when it is not: the one check every write to a scene's play space
 * starts with.
 */
async function ownedSceneTags(
  userId: string,
  idStory: number,
  idStoryScene: number,
): Promise<string[] | null> {
  const [row] = await db
    .select({ tags: storyScenes.tags })
    .from(storyScenes)
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .where(
      and(
        eq(storyScenes.idStoryScene, idStoryScene),
        eq(storyScenes.idStory, idStory),
        eq(stories.idCreatedByUser, userId),
      ),
    )
    .limit(1);
  return row?.tags ?? null;
}

/**
 * Makes a scene of the story the one the session is on: moves it to ACTIVE
 * unless it already is (the workflow stamps active_at as it does), records
 * this sitting as the one it was played in when it has none yet, and points
 * the session at it. A scene played in an earlier sitting keeps that one;
 * story_scenes.id_story_session is where it was first played.
 *
 * The scene the session was on before is left as it was. Whether it is
 * finished is the storyteller's call, made on its own pill.
 */
async function putSessionOn(
  userId: string,
  idStorySession: number,
  idStoryScene: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(storyScenes)
      .set({ status: ACTIVE, idUpdatedByUser: userId })
      .where(and(eq(storyScenes.idStoryScene, idStoryScene), ne(storyScenes.status, ACTIVE)));
    await tx
      .update(storyScenes)
      .set({ idStorySession, idUpdatedByUser: userId })
      .where(and(eq(storyScenes.idStoryScene, idStoryScene), isNull(storyScenes.idStorySession)));
    await tx
      .update(storySessions)
      .set({ idStoryScene, idUpdatedByUser: userId })
      .where(eq(storySessions.idStorySession, idStorySession));
  });
}

/**
 * What the storyteller's play space opens with: the scene the table is on,
 * its tags and cover, and the elements brought into it, so the storyteller starts from what
 * they prepared for this moment rather than an empty space.
 *
 * The scene is the current session's id_story_scene, reached through the
 * story's pointer to that session, and only while the session is being
 * played: a paused or finished session has no table to put anything on.
 * With no such session, or a session on no scene, the space starts empty.
 *
 * Empty for anyone but the story's storyteller, as for a story that is not
 * there: the scene and its elements are their preparation.
 */
export async function sa_getRunPlaySpace(idStory: number): Promise<RunPlaySpace> {
  const user = await requireUser();

  const id = idSchema.safeParse(idStory);
  if (!id.success) return EMPTY;

  const session = await playingSession(user.id, id.data);
  if (session === null) return EMPTY;

  const [row] = await db
    .select({ idStoryScene: storySessions.idStoryScene })
    .from(storySessions)
    .where(eq(storySessions.idStorySession, session))
    .limit(1);
  if (row?.idStoryScene == null) return EMPTY;

  // spaceFor holds the scene to this story, which nothing in the database
  // does for a session's scene.
  return spaceFor(id.data, row.idStoryScene);
}

/**
 * The story's RUN_SCENES_LIST_SIZE most recently touched scenes, newest
 * first, for the header's scene selector. updated_at moves on every change,
 * a status included, so the scenes in play rise to the top. Nothing for
 * anyone but the storyteller.
 */
export async function sa_listRunScenes(idStory: number): Promise<RunScene[]> {
  const user = await requireUser();

  const id = idSchema.safeParse(idStory);
  if (!id.success) return [];
  if (!(await ownsStory(user.id, id.data))) return [];

  return db
    .select({
      idStoryScene: storyScenes.idStoryScene,
      title: storyScenes.sceneTitle,
      status: storyScenes.status,
    })
    .from(storyScenes)
    .where(eq(storyScenes.idStory, id.data))
    .orderBy(desc(storyScenes.updatedAt), desc(storyScenes.idStoryScene))
    .limit(RUN_SCENES_LIST_SIZE);
}

export type LoadRunSceneResult = { ok: true; space: RunPlaySpace } | { ok: false; error: string };

/**
 * Puts the session on a scene the storyteller chose from the header, and
 * answers with the play space for it. A PENDING or COMPLETE scene becomes
 * ACTIVE and an ACTIVE one is loaded as it is; the selector asks before it
 * sends a COMPLETE one, since that undoes a scene the storyteller finished.
 *
 * Refused when the scene is not this story's or the caller is not its
 * storyteller, which are one answer, and when no session is being played,
 * since there is no table to put the scene on.
 */
export async function sa_loadRunScene(
  idStory: number,
  idStoryScene: number,
): Promise<LoadRunSceneResult> {
  const user = await requireUser();

  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };

  const [owned] = await db
    .select({ idStoryScene: storyScenes.idStoryScene })
    .from(storyScenes)
    .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
    .where(
      and(
        eq(storyScenes.idStoryScene, scene.data),
        eq(storyScenes.idStory, story.data),
        eq(stories.idCreatedByUser, user.id),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: NOT_THIS_STORY };

  const session = await playingSession(user.id, story.data);
  if (session === null) return { ok: false, error: NO_SESSION };

  await putSessionOn(user.id, session, scene.data);
  return { ok: true, space: await spaceFor(story.data, scene.data) };
}

export type CreateRunSceneResult =
  { ok: true; space: RunPlaySpace } | { ok: false; errors: Record<string, string> };

/**
 * Writes a new scene from the header's Create new scene, in the session
 * being played, and puts the table on it at once, ACTIVE: a scene made at
 * the table is made to be played now. It is inserted with the workflow's
 * default and then moved, so the move stamps active_at as any other does.
 *
 * Field errors come back for the form, and a missing session as `root`.
 * Throws for a story the caller does not tell, as sa_createStoryScene does:
 * the page never offers the form to anyone else.
 */
export async function sa_createRunScene(
  idStory: number,
  input: unknown,
): Promise<CreateRunSceneResult> {
  const user = await requireUser();
  const id = idSchema.parse(idStory);
  if (!(await ownsStory(user.id, id))) {
    throw new Error("Only the storyteller who created a story can add scenes to it");
  }

  const parsed = runSceneSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    return { ok: false, errors };
  }

  const session = await playingSession(user.id, id);
  if (session === null) return { ok: false, errors: { root: NO_SESSION } };

  const [created] = await db
    .insert(storyScenes)
    .values({
      idStory: id,
      sceneTitle: parsed.data.title,
      sceneDescription: parsed.data.description || null,
      idStorySession: session,
      idCreatedByUser: user.id,
      idUpdatedByUser: user.id,
    })
    .returning({ idStoryScene: storyScenes.idStoryScene });

  await putSessionOn(user.id, session, created.idStoryScene);
  return { ok: true, space: await spaceFor(id, created.idStoryScene) };
}

export type SceneElementFormResult =
  { ok: true; item: PlayItem } | { ok: false; errors: Record<string, string> };

/** Field errors from a failed parse, keyed by the path the form names. */
function formErrors(issues: z.core.$ZodIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[issue.path.join(".")] ??= issue.message;
  return errors;
}

/**
 * The run page's element form, parsed, with both statuses held to their
 * workflows (sa_listStatusOptions reads them from the database, as the
 * pills do): a status not in the workflow comes back as the field's error.
 */
async function parseElementForm(
  input: unknown,
): Promise<{ ok: true; values: RunElementValues } | { ok: false; errors: Record<string, string> }> {
  const parsed = runElementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error.issues) };
  const [elementOptions, sceneOptions] = await Promise.all([
    sa_listStatusOptions("elements"),
    sa_listStatusOptions("scene_elements"),
  ]);
  const errors: Record<string, string> = {};
  if (!elementOptions.some((option) => option.key === parsed.data.status)) {
    errors.status = "Choose one of the element's statuses.";
  }
  if (!sceneOptions.some((option) => option.key === parsed.data.sceneStatus)) {
    errors.sceneStatus = "Choose one of the scene's statuses.";
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values: parsed.data };
}

/** The element columns the run page's form writes. */
function elementColumns(values: RunElementValues) {
  return {
    kind: values.kind,
    name: values.name,
    initialName: values.initialName || null,
    title: values.title || null,
    description: values.description || null,
    notes: values.notes || null,
    status: values.status,
  };
}

/**
 * Writes a new element into the story from a stack's + and links it to the
 * scene under that stack's tag, each in the status the form chose, in one
 * transaction so an element is never left made but unlinked. Inserted
 * straight into its statuses: a new row has no transition to check, and the
 * status triggers still stamp each one's timestamp. The Default stack sends
 * null and the link carries no tag, which still files it in the first stack.
 *
 * Field errors come back for the form; a tag the scene does not carry comes
 * back as `root`, since the stacks it was drawn from are out of date. Throws
 * for a scene the caller does not tell, as sa_createRunScene does for a
 * story: the page never offers the form to anyone else.
 */
export async function sa_createSceneElement(
  idStory: number,
  idStoryScene: number,
  tag: string | null,
  input: unknown,
): Promise<SceneElementFormResult> {
  const user = await requireUser();
  const story = idSchema.parse(idStory);
  const scene = idSchema.parse(idStoryScene);
  const stackTag = stackTagSchema.parse(tag);

  const sceneTags = await ownedSceneTags(user.id, story, scene);
  if (sceneTags === null) throw new Error(NOT_THIS_STORY);
  if (stackTag !== null && !sceneTags.includes(stackTag)) {
    return { ok: false, errors: { root: NO_SUCH_STACK } };
  }

  const form = await parseElementForm(input);
  if (!form.ok) return form;
  const values = form.values;
  const tags = stackTag === null ? [] : [stackTag];

  const idElement = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(elements)
      .values({
        idStory: story,
        ...elementColumns(values),
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })
      .returning({ idElement: elements.idElement });
    await tx.insert(sceneElements).values({
      idStoryScene: scene,
      idElement: created.idElement,
      tags,
      status: values.sceneStatus,
      idCreatedByUser: user.id,
      idUpdatedByUser: user.id,
    });
    return created.idElement;
  });

  return {
    ok: true,
    item: linkedItem({
      idElement,
      kind: values.kind,
      name: values.name,
      initialName: values.initialName || null,
      title: values.title || null,
      tags,
      status: values.sceneStatus,
    }),
  };
}

/**
 * Saves the info popover's edit form: the element's fields and status, and
 * its link's status in this scene, in one transaction. A status that has not
 * changed is not written, since a move to the status a row holds is not a
 * transition; one that has goes through the database's transition trigger,
 * whose refusal comes back as `root`. The pill comes back as it now is.
 *
 * Throws for a scene the caller does not tell, as the create does; an
 * element not linked to the scene comes back as `root`.
 */
export async function sa_updateSceneElement(
  idStory: number,
  idStoryScene: number,
  idElement: number,
  input: unknown,
): Promise<SceneElementFormResult> {
  const user = await requireUser();
  const story = idSchema.parse(idStory);
  const scene = idSchema.parse(idStoryScene);
  const element = idSchema.parse(idElement);
  if ((await ownedSceneTags(user.id, story, scene)) === null) throw new Error(NOT_THIS_STORY);

  const form = await parseElementForm(input);
  if (!form.ok) return form;
  const values = form.values;

  const [current] = await db
    .select({
      status: vSceneElements.status,
      elementStatus: vSceneElements.elementStatus,
      tags: vSceneElements.tags,
    })
    .from(vSceneElements)
    .where(
      and(
        eq(vSceneElements.idStoryScene, scene),
        eq(vSceneElements.idElement, element),
        eq(vSceneElements.idStory, story),
      ),
    )
    .limit(1);
  if (!current) return { ok: false, errors: { root: NOT_IN_THIS_SCENE } };

  const { status, ...fields } = elementColumns(values);
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(elements)
        .set({
          ...fields,
          ...(status !== current.elementStatus ? { status } : {}),
          idUpdatedByUser: user.id,
        })
        .where(and(eq(elements.idElement, element), eq(elements.idStory, story)));
      if (values.sceneStatus !== current.status) {
        await tx
          .update(sceneElements)
          .set({ status: values.sceneStatus, idUpdatedByUser: user.id })
          .where(and(eq(sceneElements.idStoryScene, scene), eq(sceneElements.idElement, element)));
      }
    });
  } catch {
    // The transition trigger raises rather than returns, naming database
    // internals, so the form says the plain thing instead.
    return { ok: false, errors: { root: "The database refused that change of status." } };
  }

  return {
    ok: true,
    item: linkedItem({
      idElement: element,
      kind: values.kind,
      name: values.name,
      initialName: values.initialName || null,
      title: values.title || null,
      tags: current.tags ?? [],
      status: values.sceneStatus,
    }),
  };
}

export type LinkSceneElementResult = { ok: true; item: PlayItem } | { ok: false; error: string };

/**
 * Links one of the story's elements to the scene, from the library's arrow,
 * under the scene's first tag, which is the first stack's: every link carries
 * the tag of the stack it is in, so where it is filed is in the database and
 * not only on the page. Only a scene with no tags, whose one stack is the
 * page's Default, links with none. It is still there after a reload. With
 * `hidden`, the library's Add as invisible switch, the link
 * starts INVISIBLE rather than in the workflow's default. An element
 * already linked keeps its link, its tags and its status, and comes back as
 * it is.
 *
 * Refused when the scene or the element is not this story's, or the caller
 * is not its storyteller; nothing in the database holds a link's element to
 * the scene's story, so this does.
 */
export async function sa_linkSceneElement(
  idStory: number,
  idStoryScene: number,
  idElement: number,
  hidden = false,
): Promise<LinkSceneElementResult> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  const element = idSchema.safeParse(idElement);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  if (!element.success) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };

  const sceneTags = await ownedSceneTags(user.id, story.data, scene.data);
  if (sceneTags === null) return { ok: false, error: NOT_THIS_STORY };
  const firstStack = sceneTags.slice(0, 1);
  const [row] = await db
    .select({
      idElement: elements.idElement,
      kind: elements.kind,
      name: elements.name,
      initialName: elements.initialName,
      title: elements.title,
    })
    .from(elements)
    .where(and(eq(elements.idElement, element.data), eq(elements.idStory, story.data)))
    .limit(1);
  if (!row) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };

  await db
    .insert(sceneElements)
    .values({
      idStoryScene: scene.data,
      idElement: row.idElement,
      tags: firstStack,
      ...(hidden === true ? { status: SCENE_ELEMENT_HIDDEN } : {}),
      idCreatedByUser: user.id,
      idUpdatedByUser: user.id,
    })
    .onConflictDoNothing({ target: [sceneElements.idStoryScene, sceneElements.idElement] });
  const [link] = await db
    .select({ tags: sceneElements.tags, status: sceneElements.status })
    .from(sceneElements)
    .where(
      and(eq(sceneElements.idStoryScene, scene.data), eq(sceneElements.idElement, row.idElement)),
    )
    .limit(1);

  return {
    ok: true,
    item: linkedItem({ ...row, tags: link?.tags ?? [], status: link?.status ?? "" }),
  };
}

export type SetSceneElementShownResult =
  { ok: true; status: string } | { ok: false; error: string };

/**
 * The pill's eye and lock: hides an element from the players by moving its
 * link to INVISIBLE from whatever status it is in, or shows it again by
 * moving it to READY from INVISIBLE, or from DISABLED, which the pill shows
 * as a lock whose press unlocks it. The scene elements workflow lets every
 * status reach the others. A link already where it is asked to go is left
 * alone, since a move to the status it holds is not a transition; so is one
 * in INITIAL or READY asked to show, which is shown already. The status it
 * ends in comes back for the pill.
 *
 * Refused when the scene is not this story's or the caller is not its
 * storyteller, and when the element is not linked to the scene.
 */
export async function sa_setSceneElementShown(
  idStory: number,
  idStoryScene: number,
  idElement: number,
  shown: boolean,
): Promise<SetSceneElementShownResult> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  const element = idSchema.safeParse(idElement);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  if (!element.success) return { ok: false, error: NOT_IN_THIS_SCENE };
  if ((await ownedSceneTags(user.id, story.data, scene.data)) === null) {
    return { ok: false, error: NOT_THIS_STORY };
  }

  const link = and(
    eq(sceneElements.idStoryScene, scene.data),
    eq(sceneElements.idElement, element.data),
  );
  const [row] = await db
    .select({ status: sceneElements.status })
    .from(sceneElements)
    .where(link)
    .limit(1);
  if (!row) return { ok: false, error: NOT_IN_THIS_SCENE };

  const target = shown ? SCENE_ELEMENT_SHOWN : SCENE_ELEMENT_HIDDEN;
  // Showing moves only a hidden or disabled element: one already shown is
  // left in its status.
  const moves = shown
    ? row.status === SCENE_ELEMENT_HIDDEN || row.status === SCENE_ELEMENT_DISABLED
    : row.status !== SCENE_ELEMENT_HIDDEN;
  if (!moves) {
    return { ok: true, status: row.status };
  }
  await db.update(sceneElements).set({ status: target, idUpdatedByUser: user.id }).where(link);
  return { ok: true, status: target };
}

/**
 * Everything about an element linked to the scene, for the pill's info
 * popover: the element as the story holds it and its link to this scene.
 * Asked for as the popover opens rather than carried by every pill, so the
 * play space stays light and the popover shows what is stored now. Null when
 * the scene is not the caller's, or the element is not linked to it.
 */
export async function sa_getSceneElementDetail(
  idStory: number,
  idStoryScene: number,
  idElement: number,
): Promise<SceneElementDetail | null> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  const element = idSchema.safeParse(idElement);
  if (!story.success || !scene.success || !element.success) return null;
  if ((await ownedSceneTags(user.id, story.data, scene.data)) === null) return null;

  const [row] = await db
    .select({
      idSceneElement: vSceneElements.idSceneElement,
      idElement: vSceneElements.idElement,
      kind: vSceneElements.kind,
      name: vSceneElements.name,
      initialName: vSceneElements.initialName,
      title: vSceneElements.title,
      description: vSceneElements.description,
      notes: vSceneElements.notes,
      elementStatus: vSceneElements.elementStatus,
      elementTags: vSceneElements.elementTags,
      status: vSceneElements.status,
      tags: vSceneElements.tags,
      createdAt: vSceneElements.createdAt,
    })
    .from(vSceneElements)
    .where(
      and(
        eq(vSceneElements.idStoryScene, scene.data),
        eq(vSceneElements.idElement, element.data),
        eq(vSceneElements.idStory, story.data),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.idSceneElement === null ||
    row.idElement === null ||
    row.kind === null ||
    row.name === null
  ) {
    return null;
  }

  return {
    element: {
      idElement: row.idElement,
      kind: row.kind,
      name: row.name,
      initialName: row.initialName,
      title: row.title,
      description: row.description,
      notes: row.notes,
      status: row.elementStatus ?? "",
      tags: row.elementTags ?? [],
    },
    link: {
      idSceneElement: row.idSceneElement,
      status: row.status ?? "",
      tags: row.tags ?? [],
      createdAt: row.createdAt,
    },
  };
}

export type MoveSceneElementResult = { ok: true; item: PlayItem } | { ok: false; error: string };

/**
 * The info popover's Move to: files an element under another of the scene's
 * stacks by swapping the tag of the stack it was opened from for the
 * target's. Its other tags stay, so a pill in two stacks leaves only the one
 * it was moved from. `from` is null, or a tag the link lacks, for a pill in
 * the first stack only because nothing else claimed it; the target's tag is
 * then simply added. The pill comes back as it now is.
 *
 * Refused when the target is not one of the scene's tags, when the element
 * is not linked to the scene, and for a scene the caller does not tell.
 */
export async function sa_moveSceneElement(
  idStory: number,
  idStoryScene: number,
  idElement: number,
  from: string | null,
  to: string,
): Promise<MoveSceneElementResult> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  const element = idSchema.safeParse(idElement);
  const fromTag = stackTagSchema.safeParse(from);
  const toTag = stackTagSchema.safeParse(to);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  if (!element.success) return { ok: false, error: NOT_IN_THIS_SCENE };
  if (!fromTag.success || !toTag.success || toTag.data === null) {
    return { ok: false, error: NO_SUCH_STACK };
  }

  const sceneTags = await ownedSceneTags(user.id, story.data, scene.data);
  if (sceneTags === null) return { ok: false, error: NOT_THIS_STORY };
  if (!sceneTags.includes(toTag.data)) return { ok: false, error: NO_SUCH_STACK };

  const [row] = await db
    .select({
      kind: vSceneElements.kind,
      name: vSceneElements.name,
      initialName: vSceneElements.initialName,
      title: vSceneElements.title,
      tags: vSceneElements.tags,
      status: vSceneElements.status,
    })
    .from(vSceneElements)
    .where(
      and(
        eq(vSceneElements.idStoryScene, scene.data),
        eq(vSceneElements.idElement, element.data),
        eq(vSceneElements.idStory, story.data),
      ),
    )
    .limit(1);
  if (!row || row.kind === null || row.name === null) {
    return { ok: false, error: NOT_IN_THIS_SCENE };
  }

  const kept = (row.tags ?? []).filter((tag) => tag !== fromTag.data && tag !== toTag.data);
  const tags = [...kept, toTag.data];
  await db
    .update(sceneElements)
    .set({ tags, idUpdatedByUser: user.id })
    .where(
      and(eq(sceneElements.idStoryScene, scene.data), eq(sceneElements.idElement, element.data)),
    );

  return {
    ok: true,
    item: linkedItem({
      idElement: element.data,
      kind: row.kind,
      name: row.name,
      initialName: row.initialName,
      title: row.title,
      tags,
      status: row.status ?? "",
    }),
  };
}
