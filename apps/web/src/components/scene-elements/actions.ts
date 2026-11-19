"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { idSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import {
  annotatedForStoryteller,
  elementAnnotated,
  elementPictureUrl,
  sceneElementImageUrl,
} from "@/db/attachment-url";
import { setCover, storyPictureUrl } from "@/db/covers";
import { linkedItem, linkedRow, linkedRowOf, linkHasStatBlocks } from "@/db/scene-space";
import { statBlockSystems } from "@/db/stat-block-systems";
import { listStatusOptions } from "@/db/status-options";
import { ownedScene, type OwnedScene } from "@/db/story-access";
import { requireAccount } from "@/lib/authorize";
import { isTransitionRefusal } from "@/lib/db-errors";
import { rollTotal } from "@/lib/dice";
import { runElementSchema, type RunElementValues } from "@/lib/element-schemas";
import { elementColumns } from "@/lib/elements";
import { formErrors } from "@/lib/forms";
import {
  NOT_A_PULSE,
  NOT_IN_THIS_SCENE,
  NOT_THIS_STORY,
  NOT_THIS_STORYS_ELEMENT,
  NOT_THIS_STORYS_PICTURE,
  NO_SUCH_FIELD,
  NO_SUCH_STACK,
  SCENE_COMPLETE,
  STATUS_REFUSED,
} from "@/lib/messages";
import { isScenePulse, scenePulseSchema } from "@/lib/realtime/events";
import { publishLater } from "@/lib/realtime/publish";
import {
  publishSceneElement,
  publishSceneElementPulse,
  publishSceneElementRemoved,
} from "@/lib/realtime/publish-scene";
import {
  isElementShowing,
  isSceneElementStatus,
  SCENE_ELEMENT_HIDDEN,
  SCENE_ELEMENT_STATUSES,
  type ElementShowing,
  type SceneItem,
} from "@/lib/scene-elements";
import { stacksSchema } from "@/lib/stack-schemas";
import { readStatBlocks } from "@/lib/stat-block-schemas";
import { rollStartingBlocks } from "@/lib/stat-blocks";

const { elements, sceneElements, vSceneElements } = schema;

// An element's link to a scene (scene_elements): what the storyteller's
// table writes when it brings an element into the scene, changes how its
// pill stands there, or takes it out again. Beside the pill components
// rather than under the run route, since the live-edit page writes links
// too. Every action here starts with requireAccount() and then holds the
// scene to a story the caller tells, through ownedScene, which also refuses
// a complete scene: a finished scene is the record of what was played, so
// nothing in it changes.

/** The executor inside db.transaction, for a helper that runs within a caller's transaction. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// A stack's tag as the + form sends it: one of the scene's tags, or null
// for the Default stack of a scene with none.
const stackTagSchema = z.string().trim().min(1).max(200).nullable();

/**
 * The scene a write names, when it is a scene of this story told by the
 * caller and not complete; otherwise the refusal to answer with, in the
 * words every action here uses. The one prologue, since each action used to
 * spell out the same nine lines.
 */
async function writableScene(
  userId: string,
  idStory: unknown,
  idStoryScene: unknown,
): Promise<{ ok: true; scene: OwnedScene } | { ok: false; error: string }> {
  const story = idSchema.safeParse(idStory);
  const scene = idSchema.safeParse(idStoryScene);
  if (!story.success || !scene.success) return { ok: false, error: NOT_THIS_STORY };
  const owned = await ownedScene(userId, scene.data, { idStory: story.data });
  if (!owned.ok) {
    return { ok: false, error: owned.reason === "locked" ? SCENE_COMPLETE : NOT_THIS_STORY };
  }
  return owned;
}

/** One link of the scene: the link's id, held to the scene the caller named. */
function linkIn(idStoryScene: number, idSceneElement: number) {
  return and(
    eq(sceneElements.idStoryScene, idStoryScene),
    eq(sceneElements.idSceneElement, idSceneElement),
  );
}

/**
 * The tags a link is filed under: the stack asked for, or the scene's first
 * tag, the first stack's, when none was (the library's arrow and + send
 * none). The Default stack of a scene with no tags gives none at all. Null
 * for a stack the scene does not carry, since the stacks it was drawn from
 * are out of date.
 */
function stackTags(scene: OwnedScene, tag: string | null): string[] | null {
  if (tag === null) return scene.tags.slice(0, 1);
  return scene.tags.includes(tag) ? [tag] : null;
}

export type SceneElementFormResult =
  { ok: true; item: SceneItem } | { ok: false; errors: Record<string, string> };

// What the new-element form sends beside its fields: the pictures its two
// Add pictures chose, the element's own and the link's for this scene, and
// whether the players see the description (the library's Add showing info
// switch). The form's schema carries none of them, since the edit form
// sends none.
const newElementExtrasSchema = z.object({
  idAttachment: idSchema.nullable().default(null),
  idSceneAttachment: idSchema.nullable().default(null),
  showInfo: z.boolean().default(true),
});

/**
 * The run page's element form, parsed, with both statuses held to their
 * workflows (listStatusOptions reads them from the database, as the pills
 * do): a status not in the workflow comes back as the field's error.
 */
async function parseElementForm(
  input: unknown,
): Promise<{ ok: true; values: RunElementValues } | { ok: false; errors: Record<string, string> }> {
  const parsed = runElementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formErrors(parsed.error) };
  const [elementOptions, sceneOptions] = await Promise.all([
    listStatusOptions("elements"),
    listStatusOptions("scene_elements"),
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

/** The link's own columns from the run form: its external link and label for this scene. */
function sceneLinkColumns(
  values: Pick<RunElementValues, "sceneUrl" | "sceneUrlText" | "sceneLabel">,
) {
  return {
    url: values.sceneUrl || null,
    urlText: values.sceneUrlText || null,
    label: values.sceneLabel || null,
  };
}

/**
 * The pictures the new-element form chose, each held to the story's
 * finished attachments as sa_setElementImage holds one, as addresses; or the
 * refusal when one is not the story's.
 */
async function chosenPictures(
  idStory: number,
  extras: z.infer<typeof newElementExtrasSchema>,
): Promise<{ ok: true; imageUrl: string | null; sceneImageUrl: string | null } | { ok: false }> {
  const [imageUrl, sceneImageUrl] = await Promise.all([
    extras.idAttachment === null ? null : storyPictureUrl(idStory, extras.idAttachment),
    extras.idSceneAttachment === null ? null : storyPictureUrl(idStory, extras.idSceneAttachment),
  ]);
  if (extras.idAttachment !== null && imageUrl === null) return { ok: false };
  if (extras.idSceneAttachment !== null && sceneImageUrl === null) return { ok: false };
  return { ok: true, imageUrl, sceneImageUrl };
}

/** What a new link is made from, over and above the element it links and the scene. */
type NewLink = {
  idStoryScene: number;
  idElement: number;
  statBlocks: Record<string, unknown>;
  tags: string[];
  status?: string;
  showInfo?: boolean;
  label?: string | null;
  elementShowing?: string;
  url?: string | null;
  urlText?: string | null;
  userId: string;
};

/** Inserts a link to the scene and answers its id; the one insert for the three ways an element enters a scene. */
async function insertLink(tx: Tx, link: NewLink): Promise<number> {
  const { userId, ...columns } = link;
  const [made] = await tx
    .insert(sceneElements)
    .values({ ...columns, idCreatedByUser: userId, idUpdatedByUser: userId })
    .returning({ idSceneElement: sceneElements.idSceneElement });
  return made.idSceneElement;
}

/**
 * Writes a new element into the story from a stack's + and links it to the
 * scene under that stack's tag, each in the status the form chose, in one
 * transaction so an element is never left made but unlinked. Inserted
 * straight into its statuses: a new row has no transition to check, and the
 * status triggers still stamp each one's timestamp. An `idAttachment` beside
 * the fields, from the form's Add picture, is the new element's picture, and
 * an `idSceneAttachment` the link's own picture for this scene, which the
 * pill shows over the element's; each must be one of the story's finished
 * attachments. With no tag (null) the link takes the scene's first tag, the
 * first stack's, as the library's arrow does: that is what the library's +
 * sends. The Default stack of a scene with no tags sends null too, and its
 * link carries none.
 *
 * Field errors come back for the form; a tag the scene does not carry comes
 * back as `root`, since the stacks it was drawn from are out of date, and so
 * does a scene the caller does not tell or that is complete.
 */
export async function sa_createSceneElement(
  idStory: number,
  idStoryScene: number,
  tag: string | null,
  input: unknown,
): Promise<SceneElementFormResult> {
  const user = await requireAccount();
  const writable = await writableScene(user.id, idStory, idStoryScene);
  if (!writable.ok) return { ok: false, errors: { root: writable.error } };
  const { scene } = writable;
  const stackTag = stackTagSchema.safeParse(tag);
  const tags = stackTag.success ? stackTags(scene, stackTag.data) : null;
  if (tags === null) return { ok: false, errors: { root: NO_SUCH_STACK } };

  const form = await parseElementForm(input);
  if (!form.ok) return form;
  const values = form.values;

  const extras = newElementExtrasSchema.safeParse(input);
  if (!extras.success) return { ok: false, errors: { root: NOT_THIS_STORYS_PICTURE } };
  const pictures = await chosenPictures(scene.idStory, extras.data);
  if (!pictures.ok) return { ok: false, errors: { root: NOT_THIS_STORYS_PICTURE } };
  const { idAttachment, idSceneAttachment, showInfo } = extras.data;

  const { idElement, idSceneElement } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(elements)
      .values({
        idStory: scene.idStory,
        ...elementColumns(values),
        status: values.status,
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })
      .returning({ idElement: elements.idElement });
    // The link's stat blocks copy the element's at this moment, which for an
    // element just made here is none: this form posts no blocks.
    const idSceneElement = await insertLink(tx, {
      idStoryScene: scene.idStoryScene,
      idElement: created.idElement,
      statBlocks: {},
      tags,
      status: values.sceneStatus,
      showInfo,
      ...sceneLinkColumns(values),
      userId: user.id,
    });
    // Its pictures: the element's use of the one attachment, and the
    // link's of the other, each tagged cover.
    if (idAttachment !== null) {
      await setCover({ kind: "ELEMENT", idExternal: created.idElement }, idAttachment, user.id, tx);
    }
    if (idSceneAttachment !== null) {
      await setCover(
        { kind: "SCENE_ELEMENT", idExternal: idSceneElement },
        idSceneAttachment,
        user.id,
        tx,
      );
    }
    return { idElement: created.idElement, idSceneElement };
  });
  publishLater(() => publishSceneElement(scene.idStory, scene.idStoryScene, idSceneElement));

  return {
    ok: true,
    item: linkedItem(
      linkedRowOf({
        idElement,
        kind: values.kind,
        name: values.name,
        initialName: values.initialName || null,
        title: values.title || null,
        tags,
        status: values.sceneStatus,
        showInfo,
        idSceneElement,
        // This form posts no blocks, so the link starts with none.
        hasStatBlocks: false,
        label: values.sceneLabel || null,
        // The link's picture stands in front of the element's, as the pill shows them.
        imageUrl: pictures.sceneImageUrl ?? pictures.imageUrl,
        url: values.url || null,
        urlText: values.urlText || null,
        sceneUrl: values.sceneUrl || null,
        sceneUrlText: values.sceneUrlText || null,
      }),
    ),
  };
}

/**
 * Saves the info popover's edit form: the element's fields and status, and
 * its link's status in this scene, in one transaction. A status that has not
 * changed is not written, since a move to the status a row holds is not a
 * transition; one that has goes through the database's transition trigger,
 * whose refusal comes back as `root`. The pill comes back as it now is.
 *
 * A scene the caller does not tell, or that is complete, comes back as
 * `root`, as does a link that is not the scene's. The link is named by its
 * own id, since an element may be in the scene more than once; the element's
 * fields are the element's, so every copy shows them.
 */
export async function sa_updateSceneElement(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
  input: unknown,
): Promise<SceneElementFormResult> {
  const user = await requireAccount();
  const writable = await writableScene(user.id, idStory, idStoryScene);
  if (!writable.ok) return { ok: false, errors: { root: writable.error } };
  const { scene } = writable;
  const link = idSchema.safeParse(idSceneElement);
  if (!link.success) return { ok: false, errors: { root: NOT_IN_THIS_SCENE } };

  const form = await parseElementForm(input);
  if (!form.ok) return form;
  const values = form.values;

  const [current] = await db
    .select({
      idElement: vSceneElements.idElement,
      status: vSceneElements.status,
      elementStatus: vSceneElements.elementStatus,
      tags: vSceneElements.tags,
      showing: vSceneElements.elementShowing,
      showInfo: vSceneElements.showInfo,
      imageUrl: sceneElementImageUrl("v_scene_elements", "v_scene_elements"),
      annotated: annotatedForStoryteller("v_scene_elements", "v_scene_elements"),
      hasStatBlocks: linkHasStatBlocks("v_scene_elements"),
    })
    .from(vSceneElements)
    .where(
      and(
        eq(vSceneElements.idStoryScene, scene.idStoryScene),
        eq(vSceneElements.idSceneElement, link.data),
        eq(vSceneElements.idStory, scene.idStory),
      ),
    )
    .limit(1);
  if (!current || current.idElement === null) {
    return { ok: false, errors: { root: NOT_IN_THIS_SCENE } };
  }
  const element = current.idElement;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(elements)
        .set({
          ...elementColumns(values),
          ...(values.status !== current.elementStatus ? { status: values.status } : {}),
          idUpdatedByUser: user.id,
        })
        .where(and(eq(elements.idElement, element), eq(elements.idStory, scene.idStory)));
      // The link's own link always; its status only when it moved, since a
      // move to the status a row holds is not a transition.
      await tx
        .update(sceneElements)
        .set({
          ...sceneLinkColumns(values),
          ...(values.sceneStatus !== current.status ? { status: values.sceneStatus } : {}),
          idUpdatedByUser: user.id,
        })
        .where(linkIn(scene.idStoryScene, link.data));
    });
  } catch (error) {
    // The transition trigger raises rather than returns, naming database
    // internals, so the form says the plain thing instead. Only that refusal
    // is answered for: a lost connection or a bug is still an error.
    if (!isTransitionRefusal(error)) throw error;
    return { ok: false, errors: { root: STATUS_REFUSED } };
  }
  publishLater(() => publishSceneElement(scene.idStory, scene.idStoryScene, link.data));

  return {
    ok: true,
    item: linkedItem(
      linkedRowOf({
        idElement: element,
        kind: values.kind,
        name: values.name,
        initialName: values.initialName || null,
        title: values.title || null,
        tags: current.tags ?? [],
        status: values.sceneStatus,
        showing: current.showing,
        showInfo: current.showInfo,
        idSceneElement: link.data,
        hasStatBlocks: current.hasStatBlocks,
        label: values.sceneLabel || null,
        imageUrl: current.imageUrl,
        annotated: current.annotated,
        url: values.url || null,
        urlText: values.urlText || null,
        sceneUrl: values.sceneUrl || null,
        sceneUrlText: values.sceneUrlText || null,
      }),
    ),
  };
}

export type LinkSceneElementResult =
  | {
      ok: true;
      item: SceneItem;
      /** Whether the element was in the scene already, so this link is a copy of it. */
      duplicate: boolean;
    }
  | { ok: false; error: string };

/**
 * Links one of the story's elements to the scene, from the library's arrow,
 * under `tag`, the stack the library's In select names, or with none under
 * the scene's first tag, the first stack's: every link carries the tag of
 * the stack it is in, so where it is filed is in the database and not only
 * on the page. Only a scene with no tags, whose one stack is the page's
 * Default, links with none. It is still there after a reload. The options
 * are the library's switches: with `hidden` (Add as invisible) the link
 * starts INVISIBLE rather than in the workflow's default, and `showInfo`
 * (Add showing info) is whether the players see the element's description,
 * the column's default when left out. An element already in the scene is
 * linked again rather than refused, a copy with its own status, stack,
 * pictures and stat blocks, its pill showing a label of the element's name
 * with a counter ("Goblin 1" for the first copy, "Goblin 2" for the next);
 * `duplicate` says so, for the table to warn the storyteller. Every link
 * rolls its own Initialized as (rollStartingBlocks), so no two goblins
 * share the hit points rolled for the element.
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
  options: { hidden?: boolean; tag?: string | null; showInfo?: boolean } = {},
): Promise<LinkSceneElementResult> {
  const user = await requireAccount();
  const { hidden = false, tag = null, showInfo } = options;
  const writable = await writableScene(user.id, idStory, idStoryScene);
  if (!writable.ok) return writable;
  const { scene } = writable;
  const element = idSchema.safeParse(idElement);
  if (!element.success) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };
  const stackTag = stackTagSchema.safeParse(tag);
  const tags = stackTag.success ? stackTags(scene, stackTag.data) : null;
  if (tags === null) return { ok: false, error: NO_SUCH_STACK };

  const [row] = await db
    .select({
      idElement: elements.idElement,
      kind: elements.kind,
      name: elements.name,
      initialName: elements.initialName,
      title: elements.title,
      imageUrl: elementPictureUrl("elements"),
      annotated: elementAnnotated("elements"),
      url: elements.url,
      urlText: elements.urlText,
      statBlocks: elements.statBlocks,
    })
    .from(elements)
    .where(and(eq(elements.idElement, element.data), eq(elements.idStory, scene.idStory)))
    .limit(1);
  if (!row) return { ok: false, error: NOT_THIS_STORYS_ELEMENT };

  // How many times the element is in the scene already: a copy is numbered
  // after them, so the first copy of Goblin is Goblin 1.
  const [{ copies }] = await db
    .select({ copies: count() })
    .from(sceneElements)
    .where(
      and(
        eq(sceneElements.idStoryScene, scene.idStoryScene),
        eq(sceneElements.idElement, row.idElement),
      ),
    );
  const label = copies > 0 ? `${row.name} ${copies}` : null;

  // The link takes a copy of the element's stat blocks, to be changed in
  // play while the element keeps its baseline; a copy of the element takes
  // its own copy, so each is played apart. Every stat with an Initialized as
  // is rolled afresh for it, from the element's own dice for one rolled from
  // a Dice stat, so each scene element of a creature has its own hit points;
  // the rest is the element's as it stands.
  const statBlocks = rollStartingBlocks(
    await statBlockSystems(scene.idStory),
    readStatBlocks(row.statBlocks),
    rollTotal,
  );
  const idSceneElement = await db.transaction((tx) =>
    insertLink(tx, {
      idStoryScene: scene.idStoryScene,
      idElement: row.idElement,
      statBlocks,
      tags,
      label,
      // A copy's pill shows its label, so two goblins are told apart at once.
      ...(label === null ? {} : { elementShowing: "label" }),
      ...(hidden === true ? { status: SCENE_ELEMENT_HIDDEN } : {}),
      ...(showInfo === undefined ? {} : { showInfo: showInfo === true }),
      userId: user.id,
    }),
  );
  const [link] = await db
    .select({
      tags: sceneElements.tags,
      status: sceneElements.status,
      showing: sceneElements.elementShowing,
      showInfo: sceneElements.showInfo,
      sceneUrl: sceneElements.url,
      sceneUrlText: sceneElements.urlText,
      hasStatBlocks: sql<boolean>`${sceneElements.statBlocks} <> '{}'::jsonb`,
    })
    .from(sceneElements)
    .where(eq(sceneElements.idSceneElement, idSceneElement))
    .limit(1);
  publishLater(() => publishSceneElement(scene.idStory, scene.idStoryScene, idSceneElement));

  return {
    ok: true,
    duplicate: copies > 0,
    item: linkedItem(
      linkedRowOf({
        idElement: row.idElement,
        kind: row.kind,
        name: row.name,
        initialName: row.initialName,
        title: row.title,
        imageUrl: row.imageUrl,
        annotated: row.annotated,
        url: row.url,
        urlText: row.urlText,
        sceneUrl: link?.sceneUrl ?? null,
        sceneUrlText: link?.sceneUrlText ?? null,
        tags: link?.tags ?? tags,
        status: link?.status ?? "",
        showing: link?.showing ?? null,
        showInfo: link?.showInfo ?? null,
        idSceneElement,
        hasStatBlocks: link?.hasStatBlocks ?? null,
        label,
      }),
    ),
  };
}

export type SetSceneElementStatusResult =
  { ok: true; status: string } | { ok: false; error: string };

const NO_SUCH_SCENE_STATUS = `Choose one of ${SCENE_ELEMENT_STATUSES.join(", ")}.`;

/**
 * The pill's status menu: moves an element's link to the scene to any of the
 * workflow's four statuses (SCENE_ELEMENT_STATUSES), which the workflow lets
 * every status reach. A link already in the status asked for is left alone,
 * since a move to the status it holds is not a transition. The status it
 * ends in comes back for the pill.
 *
 * Refused for a status off the workflow, when the scene is not this story's
 * or the caller is not its storyteller, and when the link is not the
 * scene's. Links are named by their own id throughout these actions, since
 * an element may be in the scene more than once.
 */
export async function sa_setSceneElementStatus(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
  status: string,
): Promise<SetSceneElementStatusResult> {
  const user = await requireAccount();
  const writable = await writableScene(user.id, idStory, idStoryScene);
  if (!writable.ok) return writable;
  const { scene } = writable;
  const link = idSchema.safeParse(idSceneElement);
  if (!link.success) return { ok: false, error: NOT_IN_THIS_SCENE };
  if (!isSceneElementStatus(status)) return { ok: false, error: NO_SUCH_SCENE_STATUS };

  const where = linkIn(scene.idStoryScene, link.data);
  const [row] = await db
    .select({ status: sceneElements.status })
    .from(sceneElements)
    .where(where)
    .limit(1);
  if (!row) return { ok: false, error: NOT_IN_THIS_SCENE };
  if (row.status === status) return { ok: true, status };

  await db.update(sceneElements).set({ status, idUpdatedByUser: user.id }).where(where);
  publishLater(() => publishSceneElement(scene.idStory, scene.idStoryScene, link.data));
  return { ok: true, status };
}

export type SetSceneElementShowInfoResult =
  { ok: true; showInfo: boolean } | { ok: false; error: string };

/**
 * The pill's info toggle: whether the players' table shows the element's
 * description in this scene (scene_elements.show_info). Only the link
 * changes; the element and its other scenes are untouched.
 *
 * Refused when the scene is not this story's or the caller is not its
 * storyteller, and when the link is not the scene's.
 */
export async function sa_setSceneElementShowInfo(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
  showInfo: boolean,
): Promise<SetSceneElementShowInfoResult> {
  const user = await requireAccount();
  const writable = await writableScene(user.id, idStory, idStoryScene);
  if (!writable.ok) return writable;
  const { scene } = writable;
  const link = idSchema.safeParse(idSceneElement);
  if (!link.success) return { ok: false, error: NOT_IN_THIS_SCENE };

  const updated = await db
    .update(sceneElements)
    .set({ showInfo: showInfo === true, idUpdatedByUser: user.id })
    .where(linkIn(scene.idStoryScene, link.data))
    .returning({ showInfo: sceneElements.showInfo });
  if (updated.length === 0) return { ok: false, error: NOT_IN_THIS_SCENE };
  publishLater(() => publishSceneElement(scene.idStory, scene.idStoryScene, link.data));
  return { ok: true, showInfo: updated[0].showInfo };
}

export type PulseSceneElementResult = { ok: true } | { ok: false; error: string };

/**
 * The tack over a pill's thumbnail: a pulse about one element of the scene
 * to every players' table (publishSceneElementPulse), such as opening its
 * picture full size and closing it again. Nothing is written: a pulse is
 * something that happens at the table, not how the scene stands, so a
 * players' table that joins later never hears of it and the storyteller's
 * page keeps for itself which picture it last put up. The guards are the
 * ones a write has, so a pulse cannot say anything a write could not.
 *
 * Refused for an action the players' table does not answer
 * (SCENE_ELEMENT_PULSES), when the scene is not this story's or the caller
 * is not its storyteller, and when the link is not the scene's.
 */
export async function sa_pulseSceneElement(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
  custom: { action: string },
): Promise<PulseSceneElementResult> {
  const user = await requireAccount();
  const writable = await writableScene(user.id, idStory, idStoryScene);
  if (!writable.ok) return writable;
  const { scene } = writable;
  const link = idSchema.safeParse(idSceneElement);
  if (!link.success) return { ok: false, error: NOT_IN_THIS_SCENE };
  const parsed = scenePulseSchema.safeParse(custom);
  if (!parsed.success || !isScenePulse(parsed.data.action)) {
    return { ok: false, error: NOT_A_PULSE };
  }

  const [row] = await db
    .select({ idSceneElement: sceneElements.idSceneElement })
    .from(sceneElements)
    .where(linkIn(scene.idStoryScene, link.data))
    .limit(1);
  if (!row) return { ok: false, error: NOT_IN_THIS_SCENE };

  publishLater(() =>
    publishSceneElementPulse(scene.idStory, scene.idStoryScene, link.data, parsed.data),
  );
  return { ok: true };
}

export type SetSceneElementShowingResult =
  { ok: true; showing: ElementShowing } | { ok: false; error: string };

/**
 * The pill's name dropdown: which of the element's fields its pill shows in
 * this scene. Only the link's element_showing changes; the element and its
 * other scenes are untouched. A field the element has left empty is still
 * accepted, and the pill shows the name until it is filled in.
 *
 * Refused when the field is not one of the three, when the scene is not this
 * story's or the caller is not its storyteller, and when the link is not the
 * scene's.
 */
export async function sa_setSceneElementShowing(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
  showing: string,
): Promise<SetSceneElementShowingResult> {
  const user = await requireAccount();
  const writable = await writableScene(user.id, idStory, idStoryScene);
  if (!writable.ok) return writable;
  const { scene } = writable;
  const link = idSchema.safeParse(idSceneElement);
  if (!link.success) return { ok: false, error: NOT_IN_THIS_SCENE };
  if (!isElementShowing(showing)) return { ok: false, error: NO_SUCH_FIELD };

  const updated = await db
    .update(sceneElements)
    .set({ elementShowing: showing, idUpdatedByUser: user.id })
    .where(linkIn(scene.idStoryScene, link.data))
    .returning({ showing: sceneElements.elementShowing });
  if (updated.length === 0) return { ok: false, error: NOT_IN_THIS_SCENE };
  publishLater(() => publishSceneElement(scene.idStory, scene.idStoryScene, link.data));
  return { ok: true, showing };
}

export type UnlinkSceneElementResult = { ok: true } | { ok: false; error: string };

/**
 * The element panel's Remove from scene: deletes one link of the element to
 * the scene, so its pill leaves the play space; the element itself stays in
 * the story, its other links to this scene (its copies) and to other scenes
 * stay too. The link's status, stack tags, showing field, label and
 * activity log go with it, so adding it back starts a new link from the
 * defaults.
 *
 * Refused when the scene is not this story's or the caller is not its
 * storyteller, and when the link is not the scene's.
 */
export async function sa_unlinkSceneElement(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
): Promise<UnlinkSceneElementResult> {
  const user = await requireAccount();
  const writable = await writableScene(user.id, idStory, idStoryScene);
  if (!writable.ok) return writable;
  const { scene } = writable;
  const link = idSchema.safeParse(idSceneElement);
  if (!link.success) return { ok: false, error: NOT_IN_THIS_SCENE };

  const removed = await db
    .delete(sceneElements)
    .where(linkIn(scene.idStoryScene, link.data))
    .returning({ idElement: sceneElements.idElement });
  if (removed.length === 0) return { ok: false, error: NOT_IN_THIS_SCENE };
  publishLater(() =>
    publishSceneElementRemoved(scene.idStory, scene.idStoryScene, removed[0].idElement, link.data),
  );
  return { ok: true };
}

export type MoveSceneElementResult = { ok: true; item: SceneItem } | { ok: false; error: string };

/**
 * The info popover's Move to: files an element under another of the scene's
 * stacks by swapping the tag of the stack it was opened from for the
 * target's. Its other tags stay, so a pill in two stacks leaves only the one
 * it was moved from. `from` is null, or a tag the link lacks, for a pill in
 * the first stack only because nothing else claimed it; the target's tag is
 * then simply added. The pill comes back as it now is.
 *
 * Refused when the target is not one of the scene's tags, when the link is
 * not the scene's, and for a scene the caller does not tell.
 */
export async function sa_moveSceneElement(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
  from: string | null,
  to: string,
): Promise<MoveSceneElementResult> {
  const user = await requireAccount();
  const writable = await writableScene(user.id, idStory, idStoryScene);
  if (!writable.ok) return writable;
  const { scene } = writable;
  const link = idSchema.safeParse(idSceneElement);
  if (!link.success) return { ok: false, error: NOT_IN_THIS_SCENE };
  const fromTag = stackTagSchema.safeParse(from);
  const toTag = stackTagSchema.safeParse(to);
  if (!fromTag.success || !toTag.success || toTag.data === null) {
    return { ok: false, error: NO_SUCH_STACK };
  }
  if (!scene.tags.includes(toTag.data)) return { ok: false, error: NO_SUCH_STACK };

  const row = await linkedRow(scene.idStory, scene.idStoryScene, link.data);
  if (!row) return { ok: false, error: NOT_IN_THIS_SCENE };

  const kept = row.tags.filter((tag) => tag !== fromTag.data && tag !== toTag.data);
  const tags = [...kept, toTag.data];
  await db
    .update(sceneElements)
    .set({ tags, idUpdatedByUser: user.id })
    .where(linkIn(scene.idStoryScene, link.data));
  publishLater(() => publishSceneElement(scene.idStory, scene.idStoryScene, link.data));

  return { ok: true, item: linkedItem({ ...row, tags }) };
}

export type SetSceneElementTagsResult =
  { ok: true; item: SceneItem } | { ok: false; error: string };

/**
 * The element panel's stacks dialog: which of the scene's stacks the element
 * is filed under, the link's tags replaced with the ones ticked, kept in the
 * scene's order whatever order they were ticked in. A tag the link carried
 * that is no longer one of the scene's goes with the rest, since the dialog
 * could not offer it. No stacks at all is allowed: the pill then shows in
 * the first stack, where playStacks files anything with none of the scene's
 * tags. Only the link changes. The pill comes back as it now is.
 *
 * Refused for a stack that is not one of the scene's tags, since the stacks
 * it was ticked from are out of date; when the link is not the scene's; and
 * for a scene the caller does not tell or that is complete.
 */
export async function sa_setSceneElementTags(
  idStory: number,
  idStoryScene: number,
  idSceneElement: number,
  tags: string[],
): Promise<SetSceneElementTagsResult> {
  const user = await requireAccount();
  const writable = await writableScene(user.id, idStory, idStoryScene);
  if (!writable.ok) return writable;
  const { scene } = writable;
  const link = idSchema.safeParse(idSceneElement);
  if (!link.success) return { ok: false, error: NOT_IN_THIS_SCENE };
  const ticked = stacksSchema.safeParse(tags);
  if (!ticked.success) return { ok: false, error: NO_SUCH_STACK };
  if (ticked.data.some((tag) => !scene.tags.includes(tag))) {
    return { ok: false, error: NO_SUCH_STACK };
  }

  const row = await linkedRow(scene.idStory, scene.idStoryScene, link.data);
  if (!row) return { ok: false, error: NOT_IN_THIS_SCENE };

  const ordered = scene.tags.filter((tag) => ticked.data.includes(tag));
  await db
    .update(sceneElements)
    .set({ tags: ordered, idUpdatedByUser: user.id })
    .where(linkIn(scene.idStoryScene, link.data));
  publishLater(() => publishSceneElement(scene.idStory, scene.idStoryScene, link.data));

  return { ok: true, item: linkedItem({ ...row, tags: ordered }) };
}
