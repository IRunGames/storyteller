"use server";

import { and, eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db, schema } from "@/db";
import { annotationOf, type AnnotationRow } from "@/db/attachment-annotations";
import { attachmentFogActive, attachmentFogCovered, scenePicture } from "@/db/attachment-url";
import { ownedSceneElement } from "@/db/story-access";
import { fetchUploadedPicture, measurePicture } from "@/lib/annotation-render";
import {
  MAX_ANNOTATION_OPS,
  eraseRefusal,
  isWallStep,
  saveAnnotationSchema,
  type SaveAnnotationInput,
} from "@/lib/annotation-schemas";
import type { PictureAnnotation, PictureState } from "@/lib/annotations";
import { requireAccount } from "@/lib/authorize";
import { isUploadedBlobUrl } from "@/lib/image-uploads";
import {
  DRAWING_CHANGED_ELSEWHERE,
  DRAWING_TOO_LONG,
  NO_DRAWING,
  NO_PICTURE_TO_ANNOTATE,
  NOT_THIS_STORYS_ATTACHMENT,
  PICTURE_UNREADABLE,
} from "@/lib/messages";
import { renderPlayersCopyLater } from "@/lib/players-copy";
import { publishLater } from "@/lib/realtime/publish";
import { publishPictureChanged } from "@/lib/realtime/publish-scene";
import { idSchema } from "@/lib/schemas";

// A picture's drawing, fog of war and pen marks, from the storyteller's
// annotator (annotator-dialog.tsx). The drawing is the file's: every element
// that shows the file gives the players the drawing. Every action is the
// storyteller's alone: the drawing comes with the raw picture, which no
// player is given. Players are shown the players' copy, rendered after each
// save (lib/players-copy.ts).

const { attachmentAnnotations, attachments, elements, sceneElements, stories } = schema;

/** Deletes a players' copy from Blob, after the row that pointed at it has let it go. */
async function forget(url: string | null): Promise<void> {
  if (!url || !isUploadedBlobUrl(url)) return;
  await del(url).catch((error: unknown) =>
    console.error("Could not delete a players' copy", error),
  );
}

/**
 * What turning a drawing on writes: on, and, when its players' copy is
 * behind the drawing (changed while it was off), without that copy. A copy
 * rendered before shows less of what was covered since, so the players are
 * shown nothing until a fresh one is rendered, as they are the first time.
 */
function turnOn(row: AnnotationRow, revision: number) {
  const stale = row.playerUrl !== null && row.playerRevision !== revision;
  return {
    set: { isActive: true, ...(stale ? { playerUrl: null, playerRevision: null } : {}) },
    dropped: !row.isActive && stale ? row.playerUrl : null,
  };
}

/** One of the caller's story's pictures, with what drawing on it needs; null otherwise. */
async function ownPicture(userId: string, idAttachment: number) {
  const id = idSchema.safeParse(idAttachment);
  if (!id.success) return null;
  const [row] = await db
    .select({
      idAttachment: attachments.idAttachment,
      idStory: stories.idStory,
      url: attachments.url,
      status: attachments.status,
      isUploaded: attachments.isUploaded,
    })
    .from(attachments)
    .innerJoin(stories, eq(stories.idStory, attachments.idStory))
    .where(and(eq(attachments.idAttachment, id.data), eq(stories.idCreatedByUser, userId)))
    .limit(1);
  return row ?? null;
}

/** Whether a picture can be drawn on: finished, and a file the app uploaded, which it can fetch. */
function drawable(picture: { status: string; isUploaded: boolean; url: string | null }) {
  return (
    picture.status === "READY" &&
    picture.isUploaded &&
    picture.url !== null &&
    isUploadedBlobUrl(picture.url)
  );
}

/** A drawing as the annotator holds it, with the raw picture it is over. */
function toAnnotation(row: AnnotationRow, imageUrl: string): PictureAnnotation {
  return {
    idAttachment: row.idAttachment,
    imageUrl,
    isActive: row.isActive,
    width: row.width,
    height: row.height,
    ops: row.ops,
    revision: row.revision,
    fogOpacityPlayers: row.fogOpacityPlayers,
    fogColor: row.fogColor,
  };
}

/**
 * The picture's drawing and the raw picture under it, for the annotator;
 * null when the caller is not the storyteller or the picture has no drawing.
 */
export async function sa_getAnnotation(idAttachment: number): Promise<PictureAnnotation | null> {
  const user = await requireAccount();
  const picture = await ownPicture(user.id, idAttachment);
  if (!picture?.url) return null;
  const row = await annotationOf(picture.idAttachment);
  return row ? toAnnotation(row, picture.url) : null;
}

export type OpenAnnotationResult =
  { ok: true; annotation: PictureAnnotation } | { ok: false; error: string };

/**
 * The annotator opening on a picture: its drawing, made for it when it has
 * none (the picture fetched and measured upright, the fog covering it
 * whole), but not turned on. The players are shown nothing new until the
 * storyteller changes something in it, which turns it on (sa_saveAnnotation).
 * Refused as sa_setAnnotated refuses.
 */
export async function sa_openAnnotation(idAttachment: number): Promise<OpenAnnotationResult> {
  const user = await requireAccount();
  const picture = await ownPicture(user.id, idAttachment);
  if (!picture) return { ok: false, error: NOT_THIS_STORYS_ATTACHMENT };
  if (!drawable(picture) || !picture.url) return { ok: false, error: NO_PICTURE_TO_ANNOTATE };
  const url = picture.url;
  const existing = await annotationOf(picture.idAttachment);
  if (existing) return { ok: true, annotation: toAnnotation(existing, url) };

  let size: { width: number; height: number };
  try {
    size = await measurePicture(await fetchUploadedPicture(url));
  } catch (error) {
    console.error("Could not measure a picture to annotate", error);
    return { ok: false, error: PICTURE_UNREADABLE };
  }
  // One made meanwhile (another tab) is the one opened.
  await db
    .insert(attachmentAnnotations)
    .values({
      idAttachment: picture.idAttachment,
      isActive: false,
      width: size.width,
      height: size.height,
      idCreatedByUser: user.id,
      idUpdatedByUser: user.id,
    })
    .onConflictDoNothing();
  const row = await annotationOf(picture.idAttachment);
  return row ? { ok: true, annotation: toAnnotation(row, url) } : { ok: false, error: NO_DRAWING };
}

export type PictureStateResult = PictureState & {
  /** Whether the players' copy is behind the drawing, so a newer one is on its way. */
  behind: boolean;
};

/**
 * A picture as its annotation controls follow it: how the storyteller is
 * shown it, whether it can be drawn on, and its drawing's state, with
 * whether the players' copy is still behind. Read after the annotator
 * closes and after Annotate for players is pressed, again while behind, so
 * the pictures on the page show the copy once it is rendered. Null when the
 * picture is not the caller's story's.
 */
export async function sa_getPictureState(idAttachment: number): Promise<PictureStateResult | null> {
  const user = await requireAccount();
  const picture = await ownPicture(user.id, idAttachment);
  if (!picture) return null;
  const row = await annotationOf(picture.idAttachment);
  const annotated = row?.isActive === true;
  // Whether the copy shows nothing, and whether it has fog on it at all, are
  // read from the steps in the database (attachmentFogCovered,
  // attachmentFogActive), as every other read of a picture reads them.
  const [covered] = annotated
    ? await db
        .select({
          fogCovered: attachmentFogCovered("attachments"),
          fogActive: attachmentFogActive("attachments"),
        })
        .from(attachments)
        .where(eq(attachments.idAttachment, picture.idAttachment))
    : [];
  return {
    idAttachment: picture.idAttachment,
    shownUrl: annotated && row.playerUrl ? row.playerUrl : picture.url,
    canAnnotate: picture.status === "READY" && picture.isUploaded,
    hasDrawing: row !== null,
    isAnnotated: annotated,
    fogCovered: covered?.fogCovered === true,
    fogActive: covered?.fogActive === true,
    behind: annotated && row.playerRevision !== row.revision,
  };
}

export type SetAnnotatedResult =
  { ok: true; annotation: PictureAnnotation | null } | { ok: false; error: string };

/**
 * Annotate for players: whether the players are given the players' copy of
 * the picture rather than the picture, wherever an element shows it.
 *
 * Turned on the first time, a drawing is made: the picture is fetched and
 * measured upright, and the fog covers it whole, nothing drawn yet. Turned
 * off, the drawing is kept for the next time and the players are given the
 * picture again. Either way the players' table is told at once, so a player
 * is never left holding the raw picture of an annotated one; the copy
 * follows once it is rendered.
 *
 * Refused when the picture is not the caller's story's, and when it is not a
 * finished file the app uploaded (a typed link is fetched by no server, so
 * it cannot be rendered over).
 */
export async function sa_setAnnotated(
  idAttachment: number,
  on: boolean,
): Promise<SetAnnotatedResult> {
  const user = await requireAccount();
  const picture = await ownPicture(user.id, idAttachment);
  if (!picture) return { ok: false, error: NOT_THIS_STORYS_ATTACHMENT };
  const { idStory } = picture;
  const id = picture.idAttachment;
  const existing = await annotationOf(id);

  if (on !== true) {
    if (!existing) return { ok: true, annotation: null };
    const [row] = await db
      .update(attachmentAnnotations)
      .set({ isActive: false, idUpdatedByUser: user.id })
      .where(eq(attachmentAnnotations.idAttachment, id))
      .returning();
    publishLater(() => publishPictureChanged(idStory, id));
    return { ok: true, annotation: picture.url ? toAnnotation(row, picture.url) : null };
  }

  if (!drawable(picture) || !picture.url) return { ok: false, error: NO_PICTURE_TO_ANNOTATE };
  const url = picture.url;

  let row: AnnotationRow | undefined;
  if (existing) {
    const on = turnOn(existing, existing.revision);
    [row] = await db
      .update(attachmentAnnotations)
      .set({ ...on.set, idUpdatedByUser: user.id })
      .where(eq(attachmentAnnotations.idAttachment, id))
      .returning();
    await forget(on.dropped);
  } else {
    let size: { width: number; height: number };
    try {
      size = await measurePicture(await fetchUploadedPicture(url));
    } catch (error) {
      console.error("Could not measure a picture to annotate", error);
      return { ok: false, error: PICTURE_UNREADABLE };
    }
    // One made meanwhile (another tab turning it on) is the one kept, and
    // turned on as this asked.
    [row] = await db
      .insert(attachmentAnnotations)
      .values({
        idAttachment: id,
        width: size.width,
        height: size.height,
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })
      .onConflictDoUpdate({
        target: attachmentAnnotations.idAttachment,
        set: { isActive: true, idUpdatedByUser: user.id },
      })
      .returning();
  }
  publishLater(() => publishPictureChanged(idStory, id));
  renderPlayersCopyLater(idStory, id);
  return { ok: true, annotation: toAnnotation(row, url) };
}

export type SaveAnnotationResult =
  { ok: true; revision: number } | { ok: false; error: string; stale?: true };

/**
 * One save from the annotator: keep the first `keep` steps of the drawing as
 * it stood at `baseRevision`, add the steps after them, and the players' fog
 * and the fog's color when they changed (saveAnnotationSchema says how drawing and Undo are both
 * this). The revision goes up by one, and the players' copy is rendered from
 * it. A change made in the annotator is the picture annotated: a drawing that
 * was off is turned on with it, and the players' table told.
 *
 * Walls are the storyteller's alone, never drawn into the players' copy, so
 * a save of only wall steps (added, or taken off by Undo) that leaves the
 * players' fog and its color alone leaves what the players see alone too:
 * the picture is not turned on, nothing is published or rendered, and a
 * players' copy that was current stays current at the new revision.
 *
 * A save made from a drawing that has moved on since (another tab, another
 * device) is refused as stale rather than written over it: the annotator
 * loads the drawing again. The row is read locked, so two saves cannot both
 * build on the same revision.
 */
export async function sa_saveAnnotation(
  idAttachment: number,
  input: SaveAnnotationInput,
): Promise<SaveAnnotationResult> {
  const user = await requireAccount();
  const picture = await ownPicture(user.id, idAttachment);
  if (!picture) return { ok: false, error: NOT_THIS_STORYS_ATTACHMENT };
  const parsed = saveAnnotationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? NO_DRAWING };
  }
  const { baseRevision, keep, append, fogOpacityPlayers, fogColor } = parsed.data;
  const id = picture.idAttachment;

  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(attachmentAnnotations)
      .where(eq(attachmentAnnotations.idAttachment, id))
      .for("update");
    if (!row) return { ok: false as const, error: NO_DRAWING };
    if (row.revision !== baseRevision || keep > row.ops.length) {
      return { ok: false as const, error: DRAWING_CHANGED_ELSEWHERE, stale: true as const };
    }
    const changesOpacity =
      fogOpacityPlayers !== undefined && fogOpacityPlayers !== row.fogOpacityPlayers;
    const changesColor = fogColor !== undefined && fogColor !== row.fogColor;
    if (keep === row.ops.length && append.length === 0 && !changesOpacity && !changesColor) {
      return { ok: true as const, revision: row.revision };
    }
    const ops = [...row.ops.slice(0, keep), ...append];
    if (ops.length > MAX_ANNOTATION_OPS) return { ok: false as const, error: DRAWING_TOO_LONG };
    const refusal = eraseRefusal(ops);
    if (refusal) return { ok: false as const, error: refusal };
    const wallsOnly =
      !changesOpacity &&
      !changesColor &&
      append.every(isWallStep) &&
      row.ops.slice(keep).every(isWallStep);
    if (wallsOnly) {
      const revision = row.revision + 1;
      const [saved] = await tx
        .update(attachmentAnnotations)
        .set({
          ops,
          revision,
          ...(row.playerRevision === row.revision ? { playerRevision: revision } : {}),
          idUpdatedByUser: user.id,
        })
        .where(
          and(
            eq(attachmentAnnotations.idAttachment, id),
            eq(attachmentAnnotations.revision, baseRevision),
          ),
        )
        .returning({ revision: attachmentAnnotations.revision });
      return { ok: true as const, revision: saved.revision };
    }
    // A change made in the annotator is the picture annotated for the
    // players: the drawing is turned on with it, if it was not.
    const on = turnOn(row, row.revision + 1);
    const [saved] = await tx
      .update(attachmentAnnotations)
      .set({
        ops,
        revision: row.revision + 1,
        ...(changesOpacity ? { fogOpacityPlayers } : {}),
        ...(changesColor ? { fogColor } : {}),
        ...(row.isActive ? {} : on.set),
        idUpdatedByUser: user.id,
      })
      .where(
        and(
          eq(attachmentAnnotations.idAttachment, id),
          eq(attachmentAnnotations.revision, baseRevision),
        ),
      )
      .returning({ revision: attachmentAnnotations.revision });
    return {
      ok: true as const,
      revision: saved.revision,
      turnedOn: !row.isActive,
      dropped: row.isActive ? null : on.dropped,
    };
  });

  if (!outcome.ok) return outcome;
  if ("turnedOn" in outcome && outcome.turnedOn) {
    await forget(outcome.dropped);
    publishLater(() => publishPictureChanged(picture.idStory, id));
  }
  if ("turnedOn" in outcome) renderPlayersCopyLater(picture.idStory, id);
  return { ok: true, revision: outcome.revision };
}

/**
 * Asks for the players' copy to be rendered when it is behind the drawing,
 * and says whether it is: the annotator's safety net, called as it opens, a
 * little after its last save and as it closes, and again while the copy is
 * behind, for a render that stopped short, failed, or found the drawing held
 * by another render that has since let go.
 */
export async function sa_refreshPlayersCopy(
  idAttachment: number,
): Promise<{ ok: boolean; behind: boolean }> {
  const user = await requireAccount();
  const picture = await ownPicture(user.id, idAttachment);
  if (!picture) return { ok: false, behind: false };
  const row = await annotationOf(picture.idAttachment);
  const behind = row !== null && row.isActive && row.playerRevision !== row.revision;
  if (behind) renderPlayersCopyLater(picture.idStory, picture.idAttachment);
  return { ok: true, behind };
}

/**
 * The picture a pill shows for an element in a scene (the link's own cover,
 * else the element's), as its annotation controls need it: the pill's
 * preview and its annotated thumbnail ask for it as they are pressed, so
 * what they offer is the picture as it stands. Null when the link is not the
 * storyteller's, or shows no picture. A complete scene's links are read too.
 */
export async function sa_getScenePicture(
  idStory: number,
  idSceneElement: number,
): Promise<PictureState | null> {
  const user = await requireAccount();
  const story = idSchema.safeParse(idStory);
  const link = idSchema.safeParse(idSceneElement);
  if (!story.success || !link.success) return null;
  const owned = await ownedSceneElement(user.id, link.data, {
    idStory: story.data,
    allowLocked: true,
  });
  if (!owned.ok) return null;
  const [row] = await db
    .select({ picture: scenePicture("scene_elements", "elements") })
    .from(sceneElements)
    .innerJoin(elements, eq(elements.idElement, sceneElements.idElement))
    .where(eq(sceneElements.idSceneElement, link.data))
    .limit(1);
  return row?.picture ?? null;
}
