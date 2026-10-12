"use server";

import { and, asc, desc, eq, ilike, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { attachmentUrl, attachmentUrlById } from "@/db/attachment-url";
import { requireUser } from "@/lib/authorize";
import {
  runElementSchema,
  runStoryElementSchema,
  type RunElementValues,
} from "@/lib/element-schemas";
import { sa_listStatusOptions } from "@/components/status/actions";
import { ELEMENT_KINDS, isElementKind, type ElementKind, type StoryElement } from "@/lib/elements";
import { likeContains } from "@/lib/filter-text";
import {
  DEFAULT_ELEMENT_SHOWING,
  EMPTY_PLAY_SPACE,
  isElementShowing,
  pillText,
  RUN_LIST_SIZE,
  RUN_SCENES_LIST_SIZE,
  SCENE_ELEMENT_DISABLED,
  SCENE_ELEMENT_HIDDEN,
  SCENE_ELEMENT_SHOWN,
  type PlayItem,
  type RunPlaySpace,
  type RunScene,
  type ElementDetail,
  type ElementShowing,
  type ElementPanelDetail,
} from "@/lib/run";
import { runSceneSchema } from "@/lib/scene-schemas";
import { SCENE_LOCKED_STATUS } from "@/lib/scenes";
import { sessionTitleSchema } from "@/lib/session-schemas";
import { sceneStacksSchema } from "@/lib/stack-schemas";

const {
  attachments,
  elements,
  sceneElements,
  stories,
  storyScenes,
  storySessions,
  vSceneElements,
} = schema;

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
const NOT_THIS_STORYS_SESSION = "That session is not part of this story.";
const SCENE_COMPLETE = "That scene is complete, so nothing in it can change.";

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
      showing: vSceneElements.elementShowing,
      imageUrl: attachmentUrlById("v_scene_elements"),
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
        showing: row.showing,
        imageUrl: row.imageUrl,
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
 * labelled with whichever of the element's fields the link's
 * element_showing names, the initial name for a new link, falling back to
 * the name when that field is empty (pillText). `showing` is null or
 * unknown only for a row read before the column existed, and shows the
 * default.
 */
function linkedItem(row: {
  idElement: number;
  kind: string;
  name: string;
  initialName: string | null;
  title: string | null;
  tags: string[];
  status: string;
  showing?: string | null;
  /** The element's picture (elements.id_attachment), when it has one. */
  imageUrl?: string | null;
}): PlayItem {
  const fields = { initial_name: row.initialName, name: row.name, title: row.title };
  const showing = isElementShowing(row.showing) ? row.showing : DEFAULT_ELEMENT_SHOWING;
  const { label, detail } = pillText(fields, showing);
  return {
    key: `${row.kind}:${row.idElement}`,
    kind: row.kind as PlayItem["kind"],
    label,
    detail,
    imageUrl: row.imageUrl ?? null,
    sceneTags: row.tags,
    sceneStatus: row.status,
    fields,
    showing,
  };
}

/**
 * The scene's tags and status when it is a scene of this story told by the
 * caller, or null when it is not: the one check every read and write of a
 * scene's play space starts with. A write then refuses a scene whose status
 * is SCENE_LOCKED_STATUS (lockedScene), since a complete scene is the record
 * of what was played.
 */
async function ownedScene(
  userId: string,
  idStory: number,
  idStoryScene: number,
): Promise<{ tags: string[]; status: string } | null> {
  const [row] = await db
    .select({ tags: storyScenes.tags, status: storyScenes.status })
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
  return row ?? null;
}

/** Whether a scene ownedScene found is complete, so its play space takes no change. */
function lockedScene(scene: { status: string }): boolean {
  return scene.status === SCENE_LOCKED_STATUS;
}

/**
 * Makes a scene of the story the one the session is on: moves it to ACTIVE
 * unless it already is (the workflow stamps active_at as it does), records
 * this sitting as the one it was played in when it has none yet, and points
 * the session at it. A scene played in an earlier sitting keeps that one;
 * story_scenes.id_story_session is where it was first played.
 *
 * A COMPLETE scene is only looked at: the session points at it, so the
 * table shows it, but it stays complete and no sitting is recorded for it.
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
      .where(
        and(
          eq(storyScenes.idStoryScene, idStoryScene),
          notInArray(storyScenes.status, [ACTIVE, SCENE_LOCKED_STATUS]),
        ),
      );
    await tx
      .update(storyScenes)
      .set({ idStorySession, idUpdatedByUser: userId })
      .where(
        and(
          eq(storyScenes.idStoryScene, idStoryScene),
          isNull(storyScenes.idStorySession),
          ne(storyScenes.status, SCENE_LOCKED_STATUS),
        ),
      );
    await tx
      .update(storySessions)
      .set({ idStoryScene, idUpdatedByUser: userId })
      .where(eq(storySessions.idStorySession, idStorySession));
  });
}

export type SetSessionTitleResult =
  { ok: true; title: string | null } | { ok: false; error: string };

/**
 * The header's session title, renamed in place: trimmed, and cleared to null
 * when left empty, so the header goes back to "Session 3". Any session of
 * the story can be renamed, being played or not; the header only offers the
 * one at the table. The title as saved comes back.
 *
 * Refused when the title is too long, and when the session is not one of
 * this story's or the caller is not its storyteller.
 */
export async function sa_setSessionTitle(
  idStory: number,
  idStorySession: number,
  title: string,
): Promise<SetSessionTitleResult> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const session = idSchema.safeParse(idStorySession);
  if (!story.success || !session.success) return { ok: false, error: NOT_THIS_STORYS_SESSION };
  const parsed = sessionTitleSchema.safeParse(title);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await ownsStory(user.id, story.data))) return { ok: false, error: NOT_THIS_STORYS_SESSION };

  const updated = await db
    .update(storySessions)
    .set({ title: parsed.data, idUpdatedByUser: user.id })
    .where(
      and(eq(storySessions.idStorySession, session.data), eq(storySessions.idStory, story.data)),
    )
    .returning({ title: storySessions.title });
  if (updated.length === 0) return { ok: false, error: NOT_THIS_STORYS_SESSION };
  return { ok: true, title: updated[0].title };
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
 * answers with the play space for it. A PENDING scene becomes ACTIVE, and
 * an ACTIVE or COMPLETE one is loaded as it is: a complete scene stays
 * complete, and the table shows it locked.
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

// The new-element form's chosen picture, beside its fields: the form's
// schema does not carry it, since the edit form never sends one.
const newElementPictureSchema = z.object({ idAttachment: idSchema.nullable().default(null) });

/**
 * The address of one of the story's finished attachments, or null when it
 * is not one: id_story on attachments is kept by a trigger for whichever
 * part of the story it hangs off, so this covers the story's own and every
 * scene's.
 */
async function storyPictureUrl(idStory: number, idAttachment: number): Promise<string | null> {
  const [row] = await db
    .select({ url: attachments.url })
    .from(attachments)
    .where(
      and(
        eq(attachments.idAttachment, idAttachment),
        eq(attachments.idStory, idStory),
        eq(attachments.status, "READY"),
      ),
    )
    .limit(1);
  return row?.url ?? null;
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
function elementColumns(values: Omit<RunElementValues, "sceneStatus">) {
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
 * status triggers still stamp each one's timestamp. An `idAttachment` beside
 * the fields, from the form's Add picture, is the new element's picture; it
 * must be one of the story's finished attachments. With no tag (null) the
 * link takes the scene's first tag, the first stack's, as the library's
 * arrow does: that is what the library's + sends. The Default stack of a
 * scene with no tags sends null too, and its link carries none.
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

  const owned = await ownedScene(user.id, story, scene);
  if (owned === null) throw new Error(NOT_THIS_STORY);
  if (lockedScene(owned)) return { ok: false, errors: { root: SCENE_COMPLETE } };
  const sceneTags = owned.tags;
  if (stackTag !== null && !sceneTags.includes(stackTag)) {
    return { ok: false, errors: { root: NO_SUCH_STACK } };
  }

  const form = await parseElementForm(input);
  if (!form.ok) return form;
  const values = form.values;
  const tags = stackTag === null ? sceneTags.slice(0, 1) : [stackTag];

  // The picture the form's Add picture chose, if any: held to the story's
  // finished attachments as sa_setElementImage holds it.
  const pictureId = newElementPictureSchema.safeParse(input);
  if (!pictureId.success) return { ok: false, errors: { root: NOT_THIS_STORYS_PICTURE } };
  let imageUrl: string | null = null;
  if (pictureId.data.idAttachment !== null) {
    imageUrl = await storyPictureUrl(story, pictureId.data.idAttachment);
    if (imageUrl === null) return { ok: false, errors: { root: NOT_THIS_STORYS_PICTURE } };
  }

  const idElement = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(elements)
      .values({
        idStory: story,
        ...elementColumns(values),
        idAttachment: pictureId.data.idAttachment,
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
      imageUrl,
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
  const owned = await ownedScene(user.id, story, scene);
  if (owned === null) throw new Error(NOT_THIS_STORY);
  if (lockedScene(owned)) return { ok: false, errors: { root: SCENE_COMPLETE } };

  const form = await parseElementForm(input);
  if (!form.ok) return form;
  const values = form.values;

  const [current] = await db
    .select({
      status: vSceneElements.status,
      elementStatus: vSceneElements.elementStatus,
      tags: vSceneElements.tags,
      showing: vSceneElements.elementShowing,
      imageUrl: attachmentUrlById("v_scene_elements"),
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
      showing: current.showing,
      imageUrl: current.imageUrl,
    }),
  };
}

export type LinkSceneElementResult = { ok: true; item: PlayItem } | { ok: false; error: string };

/**
 * Links one of the story's elements to the scene, from the library's arrow,
 * under `tag`, the stack the library's In select names, or with none under
 * the scene's first tag, the first stack's: every link carries the tag of
 * the stack it is in, so where it is filed is in the database and not only
 * on the page. Only a scene with no tags, whose one stack is the page's
 * Default, links with none. It is still there after a reload. With
 * `hidden`, the library's Add as invisible switch, the link
 * starts INVISIBLE rather than in the workflow's default. An element
 * already linked keeps its link, its tags and its status, and comes back as
 * it is.
 *
 * Refused when the scene or the element is not this story's, or the caller
 * is not its storyteller; nothing in the database holds a link's element to
 * the scene's story, so this does. Refused too for a tag the scene does not
 * carry, since the stacks it was chosen from are out of date.
 */
export async function sa_linkSceneElement(
  idStory: number,
  idStoryScene: number,
  idElement: number,
  hidden = false,
  tag: string | null = null,
): Promise<LinkSceneElementResult> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  const element = idSchema.safeParse(idElement);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  if (!element.success) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };

  const stackTag = stackTagSchema.safeParse(tag);
  if (!stackTag.success) return { ok: false, error: NO_SUCH_STACK };

  const owned = await ownedScene(user.id, story.data, scene.data);
  if (owned === null) return { ok: false, error: NOT_THIS_STORY };
  if (lockedScene(owned)) return { ok: false, error: SCENE_COMPLETE };
  const sceneTags = owned.tags;
  if (stackTag.data !== null && !sceneTags.includes(stackTag.data)) {
    return { ok: false, error: NO_SUCH_STACK };
  }
  const tags = stackTag.data === null ? sceneTags.slice(0, 1) : [stackTag.data];
  const [row] = await db
    .select({
      idElement: elements.idElement,
      kind: elements.kind,
      name: elements.name,
      initialName: elements.initialName,
      title: elements.title,
      imageUrl: attachmentUrlById("elements"),
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
      tags,
      ...(hidden === true ? { status: SCENE_ELEMENT_HIDDEN } : {}),
      idCreatedByUser: user.id,
      idUpdatedByUser: user.id,
    })
    .onConflictDoNothing({ target: [sceneElements.idStoryScene, sceneElements.idElement] });
  const [link] = await db
    .select({
      tags: sceneElements.tags,
      status: sceneElements.status,
      showing: sceneElements.elementShowing,
    })
    .from(sceneElements)
    .where(
      and(eq(sceneElements.idStoryScene, scene.data), eq(sceneElements.idElement, row.idElement)),
    )
    .limit(1);

  return {
    ok: true,
    item: linkedItem({
      ...row,
      tags: link?.tags ?? [],
      status: link?.status ?? "",
      showing: link?.showing,
    }),
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
  const owned = await ownedScene(user.id, story.data, scene.data);
  if (owned === null) return { ok: false, error: NOT_THIS_STORY };
  if (lockedScene(owned)) return { ok: false, error: SCENE_COMPLETE };

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

export type SetSceneElementShowingResult =
  { ok: true; showing: ElementShowing } | { ok: false; error: string };

const NO_SUCH_FIELD = "Choose the initial name, the name or the title.";

/**
 * The pill's name dropdown: which of the element's fields its pill shows in
 * this scene. Only the link's element_showing changes; the element and its
 * other scenes are untouched. A field the element has left empty is still
 * accepted, and the pill shows the name until it is filled in.
 *
 * Refused when the field is not one of the three, when the scene is not this
 * story's or the caller is not its storyteller, and when the element is not
 * linked to the scene.
 */
export async function sa_setSceneElementShowing(
  idStory: number,
  idStoryScene: number,
  idElement: number,
  showing: string,
): Promise<SetSceneElementShowingResult> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  const element = idSchema.safeParse(idElement);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  if (!element.success) return { ok: false, error: NOT_IN_THIS_SCENE };
  if (!isElementShowing(showing)) return { ok: false, error: NO_SUCH_FIELD };
  const owned = await ownedScene(user.id, story.data, scene.data);
  if (owned === null) return { ok: false, error: NOT_THIS_STORY };
  if (lockedScene(owned)) return { ok: false, error: SCENE_COMPLETE };

  const updated = await db
    .update(sceneElements)
    .set({ elementShowing: showing, idUpdatedByUser: user.id })
    .where(
      and(eq(sceneElements.idStoryScene, scene.data), eq(sceneElements.idElement, element.data)),
    )
    .returning({ showing: sceneElements.elementShowing });
  if (updated.length === 0) return { ok: false, error: NOT_IN_THIS_SCENE };
  return { ok: true, showing };
}

export async function sa_listSceneLibraryElements(
  idStory: number,
  idStoryScene: number,
  kind: ElementKind,
  query: string = "",
): Promise<StoryElement[]> {
  const user = await requireUser();
  // The same bound as sa_listStoryElements' search, refused the same way.
  const needle = z.string().max(200).parse(query).trim();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success || !isElementKind(kind)) return [];
  if ((await ownedScene(user.id, story.data, scene.data)) === null) return [];

  const rows = await db
    .select({
      idElement: vSceneElements.idElement,
      status: vSceneElements.elementStatus,
      name: vSceneElements.name,
      title: vSceneElements.title,
      description: vSceneElements.description,
    })
    .from(vSceneElements)
    .where(
      and(
        eq(vSceneElements.idStoryScene, scene.data),
        eq(vSceneElements.idStory, story.data),
        eq(vSceneElements.kind, kind),
        needle === "" ? undefined : ilike(vSceneElements.elementSearchText, likeContains(needle)),
      ),
    )
    .orderBy(asc(vSceneElements.name), asc(vSceneElements.idElement))
    .limit(RUN_LIST_SIZE);
  // The view's columns are all nullable to Drizzle; a link always has its element.
  return rows.map((row) => ({
    idElement: row.idElement!,
    status: row.status ?? "",
    name: row.name ?? "",
    title: row.title,
    description: row.description,
  }));
}

export type UpdateStoryElementResult =
  { ok: true; element: ElementDetail } | { ok: false; errors: Record<string, string> };

/**
 * The library info popover's edit: the element's own fields and its status
 * in the story, whether or not it is in any scene, so nothing about a scene
 * is read or written. A status that has not changed is not written, as
 * sa_updateSceneElement does not, and one off the workflow comes back as
 * the field's error. The element comes back as it now is.
 *
 * Throws for a story the caller does not tell, as the scene's edit does;
 * an element not in the story comes back as `root`.
 */
export async function sa_updateStoryElement(
  idStory: number,
  idElement: number,
  input: unknown,
): Promise<UpdateStoryElementResult> {
  const user = await requireUser();
  const story = idSchema.parse(idStory);
  const element = idSchema.parse(idElement);
  if (!(await ownsStory(user.id, story))) throw new Error(NOT_THIS_STORY);

  const parsed = runStoryElementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error.issues) };
  const values = parsed.data;
  const options = await sa_listStatusOptions("elements");
  if (!options.some((option) => option.key === values.status)) {
    return { ok: false, errors: { status: "Choose one of the element's statuses." } };
  }

  const [current] = await db
    .select({ status: elements.status })
    .from(elements)
    .where(and(eq(elements.idElement, element), eq(elements.idStory, story)))
    .limit(1);
  if (!current) return { ok: false, errors: { root: NOT_THIS_STORYS_ELEMENT } };

  const { status, ...fields } = elementColumns(values);
  try {
    await db
      .update(elements)
      .set({
        ...fields,
        ...(status !== current.status ? { status } : {}),
        idUpdatedByUser: user.id,
      })
      .where(and(eq(elements.idElement, element), eq(elements.idStory, story)));
  } catch {
    // The transition trigger raises rather than returns; see sa_updateSceneElement.
    return { ok: false, errors: { root: "The database refused that change of status." } };
  }

  const detail = await sa_getElementDetail(story, element);
  if (!detail) return { ok: false, errors: { root: NOT_THIS_STORYS_ELEMENT } };
  return { ok: true, element: detail.element };
}

/**
 * Everything the element panel shows, from a pill or from the library: the
 * element as the story holds it, whether or not it is in a scene, and its
 * link to the scene the table is on (`idStoryScene`, null for none), or null
 * when it is not in that scene. The link decides whether the panel shows
 * the scene's part: its status, its stack tags and Remove from scene.
 * Asked for as the panel opens, so the play space and the library stay
 * light and the panel shows what is stored now, the eye's last press
 * included. Null when the story is not the caller's or the element is not
 * the story's.
 */
export async function sa_getElementDetail(
  idStory: number,
  idElement: number,
  idStoryScene: number | null = null,
): Promise<ElementPanelDetail | null> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const element = idSchema.safeParse(idElement);
  const scene = idSchema.nullable().safeParse(idStoryScene);
  if (!story.success || !element.success || !scene.success) return null;
  if (!(await ownsStory(user.id, story.data))) return null;

  const [row] = await db
    .select({
      idElement: elements.idElement,
      kind: elements.kind,
      name: elements.name,
      initialName: elements.initialName,
      title: elements.title,
      description: elements.description,
      notes: elements.notes,
      imageUrl: attachmentUrlById("elements"),
      status: elements.status,
      tags: elements.tags,
    })
    .from(elements)
    .where(and(eq(elements.idElement, element.data), eq(elements.idStory, story.data)))
    .limit(1);
  if (!row) return null;

  // The scene comes from the page, so it only counts when it is this
  // story's: nothing in the database holds a link's two halves to one story.
  const [link] =
    scene.data === null
      ? []
      : await db
          .select({
            idSceneElement: sceneElements.idSceneElement,
            status: sceneElements.status,
            tags: sceneElements.tags,
            createdAt: sceneElements.createdAt,
          })
          .from(sceneElements)
          .innerJoin(storyScenes, eq(storyScenes.idStoryScene, sceneElements.idStoryScene))
          .where(
            and(
              eq(sceneElements.idStoryScene, scene.data),
              eq(sceneElements.idElement, row.idElement),
              eq(storyScenes.idStory, story.data),
            ),
          )
          .limit(1);
  return { element: row, link: link ?? null };
}

export type UnlinkSceneElementResult = { ok: true } | { ok: false; error: string };

/**
 * The library popover's Remove from scene: deletes the element's link to the
 * scene, so it leaves the play space; the element itself stays in the story,
 * and its links to other scenes stay too. The link's status, stack tags,
 * showing field and activity log go with it, so adding it back starts a new
 * link from the defaults.
 *
 * Refused when the scene is not this story's or the caller is not its
 * storyteller, and when the element is not linked to the scene.
 */
export async function sa_unlinkSceneElement(
  idStory: number,
  idStoryScene: number,
  idElement: number,
): Promise<UnlinkSceneElementResult> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  const element = idSchema.safeParse(idElement);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  if (!element.success) return { ok: false, error: NOT_IN_THIS_SCENE };
  const owned = await ownedScene(user.id, story.data, scene.data);
  if (owned === null) return { ok: false, error: NOT_THIS_STORY };
  if (lockedScene(owned)) return { ok: false, error: SCENE_COMPLETE };

  const removed = await db
    .delete(sceneElements)
    .where(
      and(eq(sceneElements.idStoryScene, scene.data), eq(sceneElements.idElement, element.data)),
    )
    .returning({ idSceneElement: sceneElements.idSceneElement });
  if (removed.length === 0) return { ok: false, error: NOT_IN_THIS_SCENE };
  return { ok: true };
}

export type SetElementImageResult =
  { ok: true; imageUrl: string | null } | { ok: false; error: string };

const NOT_THIS_STORYS_PICTURE = "That attachment is not a picture in this story.";

/**
 * A pill's + for a picture, and the info popovers' Add picture and −:
 * points the element at one of its story's attachments
 * (elements.id_attachment), picked from the story's list or a scene's, or
 * with null takes its picture away. The attachment is only pointed at, not
 * moved, so it stays in its list either way. The picture is the element's, in every scene, and not part of what
 * a scene holds, so a complete scene does not refuse it.
 *
 * Refused when the story is not the caller's, the element is not the
 * story's, or the attachment is not one of the story's finished ones.
 */
export async function sa_setElementImage(
  idStory: number,
  idElement: number,
  idAttachment: number | null,
): Promise<SetElementImageResult> {
  const user = await requireUser();
  const story = idSchema.safeParse(idStory);
  const element = idSchema.safeParse(idElement);
  const attachment = idSchema.nullable().safeParse(idAttachment);
  if (!story.success || !(await ownsStory(user.id, story.data))) {
    return { ok: false, error: NOT_THIS_STORY };
  }
  if (!element.success) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };
  if (!attachment.success) return { ok: false, error: NOT_THIS_STORYS_PICTURE };

  if (attachment.data === null) {
    const cleared = await db
      .update(elements)
      .set({ idAttachment: null, idUpdatedByUser: user.id })
      .where(and(eq(elements.idElement, element.data), eq(elements.idStory, story.data)))
      .returning({ idElement: elements.idElement });
    if (cleared.length === 0) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };
    return { ok: true, imageUrl: null };
  }

  const url = await storyPictureUrl(story.data, attachment.data);
  if (url === null) return { ok: false, error: NOT_THIS_STORYS_PICTURE };

  const updated = await db
    .update(elements)
    .set({ idAttachment: attachment.data, idUpdatedByUser: user.id })
    .where(and(eq(elements.idElement, element.data), eq(elements.idStory, story.data)))
    .returning({ idElement: elements.idElement });
  if (updated.length === 0) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };
  return { ok: true, imageUrl: url };
}

export type SetSceneStacksResult =
  { ok: true; tags: string[] } | { ok: false; errors: Record<string, string> };

/**
 * Manage stacks and the In select's Create new stack: the scene's stacks,
 * which are its tags, in the order given. With `saveForStory` they also
 * become the story's standard_tags, which every scene made afterwards starts
 * with (standard_tags_for_story); scenes already made keep their own.
 *
 * A renamed stack takes its links with it: each of the scene's links filed
 * under the old name is filed under the new one. Links filed under a stack
 * that is taken away keep that tag: the play space shows them in the first
 * stack, and putting the stack back puts them back in it.
 *
 * Errors come back keyed by the field, as a form's do. Throws for a scene
 * the caller does not tell: the page never offers this to anyone else.
 */
export async function sa_setSceneStacks(
  idStory: number,
  idStoryScene: number,
  input: unknown,
): Promise<SetSceneStacksResult> {
  const user = await requireUser();
  const story = idSchema.parse(idStory);
  const scene = idSchema.parse(idStoryScene);
  const owned = await ownedScene(user.id, story, scene);
  if (owned === null) throw new Error(NOT_THIS_STORY);
  if (lockedScene(owned)) return { ok: false, errors: { tags: SCENE_COMPLETE } };

  const parsed = sceneStacksSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error.issues) };
  const { tags, renames, saveForStory } = parsed.data;
  // A rename is of a stack the scene has; one it lacks means the dialog's
  // list is out of date.
  const moves = renames.filter((rename) => rename.from !== rename.to);
  if (moves.some((rename) => !owned.tags.includes(rename.from))) {
    return { ok: false, errors: { tags: NO_SUCH_STACK } };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(storyScenes)
      .set({ tags, idUpdatedByUser: user.id })
      .where(and(eq(storyScenes.idStoryScene, scene), eq(storyScenes.idStory, story)));
    // The scene's links filed under a renamed stack follow it. In two
    // passes, through a placeholder no stack can be called (stackNameSchema
    // refuses control characters, and these start with one), so a swap (a
    // to b, b to a) does not fold both into one.
    const held = moves.map((_, index) => `\u0001rename-${index}`);
    for (const [index, rename] of moves.entries()) {
      await tx
        .update(sceneElements)
        .set({ tags: sql`array_replace(${sceneElements.tags}, ${rename.from}, ${held[index]})` })
        .where(eq(sceneElements.idStoryScene, scene));
    }
    for (const [index, rename] of moves.entries()) {
      await tx
        .update(sceneElements)
        .set({ tags: sql`array_replace(${sceneElements.tags}, ${held[index]}, ${rename.to})` })
        .where(eq(sceneElements.idStoryScene, scene));
    }
    if (saveForStory) {
      await tx
        .update(stories)
        .set({ standardTags: tags, idUpdatedByUser: user.id })
        .where(and(eq(stories.idStory, story), eq(stories.idCreatedByUser, user.id)));
    }
  });
  return { ok: true, tags };
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

  const owned = await ownedScene(user.id, story.data, scene.data);
  if (owned === null) return { ok: false, error: NOT_THIS_STORY };
  if (lockedScene(owned)) return { ok: false, error: SCENE_COMPLETE };
  if (!owned.tags.includes(toTag.data)) return { ok: false, error: NO_SUCH_STACK };

  const [row] = await db
    .select({
      kind: vSceneElements.kind,
      name: vSceneElements.name,
      initialName: vSceneElements.initialName,
      title: vSceneElements.title,
      tags: vSceneElements.tags,
      status: vSceneElements.status,
      showing: vSceneElements.elementShowing,
      imageUrl: attachmentUrlById("v_scene_elements"),
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
      showing: row.showing,
      imageUrl: row.imageUrl,
    }),
  };
}
