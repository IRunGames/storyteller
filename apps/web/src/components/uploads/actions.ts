"use server";

import { and, desc, eq, ilike, inArray, notExists, sql } from "drizzle-orm";
import { del } from "@vercel/blob";
import { z } from "zod";
import { searchSchema } from "@/lib/schemas";
import { db, schema } from "@/db";
import { attachmentFogActive, attachmentFogCovered } from "@/db/attachment-url";
import { clearCover, setCover, useIsCover } from "@/db/covers";
import {
  ownedElement,
  ownedScene,
  ownedSceneElement,
  ownedSession,
  ownedStory,
  type SceneRefusal,
} from "@/db/story-access";
import { requireAccount } from "@/lib/authorize";
import { DRAWING_WOULD_BE_LOST, SCENE_COMPLETE } from "@/lib/messages";
import { likeContains } from "@/lib/filter-text";
import { isOwnUploadedBlobUrl, isUploadedBlobUrl } from "@/lib/image-uploads";
import {
  attachHolderKindSchema,
  attachmentFileSchema,
  attachmentIdsSchema,
  attachmentKindSchema,
  attachmentTagsSchema,
  attachmentUrlSchema,
  idAttachmentSchema,
  idExternalSchema,
} from "@/lib/attachment-schemas";
import {
  ATTACH_HOLDER_NOUNS,
  type AttachHolderKind,
  type Attachment,
  type AttachmentKind,
} from "@/lib/attachments";
import { publishLater } from "@/lib/realtime/publish";
import {
  publishElementChanged,
  publishSceneChanged,
  publishSceneElementPictures,
} from "@/lib/realtime/publish-scene";

const { attachmentAnnotations, attachments, attachmentUses, vAttachmentUses, stories } = schema;

const NO_ACCESS = "You do not have access to that story.";

/** A holder found to be the caller's, with its story; or why it was refused. */
type HolderAccess = { idStory: number; refused: null } | { idStory: null; refused: SceneRefusal };

/**
 * The story a holder belongs to, when the caller is its storyteller
 * (db/story-access.ts), or why not: a holder that is not there or is
 * someone else's story's, or a link to a complete scene, whose pictures are
 * part of the record of what was played and so take no change
 * (SCENE_LOCKED_STATUS), as every other write to a link is held. A story is
 * its own; a session, a scene or an element names theirs; a scene element's
 * is its scene's, as tr_attachment_uses_same_story reads it. The
 * exists-trigger (tr_biu_attachment_uses_external_exists) only proves the
 * holder row is there; it is a backstop against a bad id, never the
 * authorisation. A scene's own pictures are not locked: the storyteller
 * curates a finished scene's gallery from its Pictures. A read passes
 * `allowLocked`, since a complete scene's pictures are still shown.
 */
async function holderStory(
  userId: string,
  kind: AttachmentKind,
  idExternal: number,
  options: { allowLocked?: boolean } = {},
): Promise<HolderAccess> {
  const notYours: HolderAccess = { idStory: null, refused: "not-yours" };
  const found = (idStory: number | undefined | null): HolderAccess =>
    idStory == null ? notYours : { idStory, refused: null };
  switch (kind) {
    case "STORY":
      return found((await ownedStory(userId, idExternal))?.idStory);
    case "STORY_SESSION":
      return found((await ownedSession(userId, idExternal))?.idStory);
    case "STORY_SCENE": {
      const scene = await ownedScene(userId, idExternal, { allowLocked: true });
      return found(scene.ok ? scene.scene.idStory : null);
    }
    case "ELEMENT":
      return found((await ownedElement(userId, idExternal))?.idStory);
    case "SCENE_ELEMENT": {
      const link = await ownedSceneElement(userId, idExternal, options);
      return link.ok ? found(link.link.idStory) : { idStory: null, refused: link.reason };
    }
  }
}

/** The refusal a holder answers with, in the words the pickers show. */
function refusal(access: { refused: SceneRefusal }): string {
  return access.refused === "locked" ? SCENE_COMPLETE : NO_ACCESS;
}

/**
 * The story that owns an attachment, when the caller is its storyteller, or
 * a throw. Tags and deletion are choices about the story, so the authority
 * is the story's storyteller rather than whoever uploaded the row. A row
 * that is not there, is unclaimed (no story yet), or is another's story's
 * answers the same way, like sa_deleteAttachment's "not yours": the UI never
 * offers any of them, and the caller need not learn which it was.
 */
async function ownedAttachmentStory(userId: string, attachmentId: number): Promise<number> {
  const [row] = await db
    .select({ idStory: attachments.idStory, owner: stories.idCreatedByUser })
    .from(attachments)
    .innerJoin(stories, eq(stories.idStory, attachments.idStory))
    .where(eq(attachments.idAttachment, attachmentId))
    .limit(1);
  if (!row || row.idStory === null || row.owner !== userId) {
    throw new Error("Attachment not found");
  }
  return row.idStory;
}

/**
 * Starts an attachment: a typed link is READY at once because nothing more
 * has to happen to it, while a file about to be uploaded needs a row to be
 * marked ready or failed once Blob has it. idCreatedByUser and
 * idUpdatedByUser come from the session, never from the client.
 *
 * The file is the holder's story's (attachments.id_story), and a holder
 * other than the story itself gets its use of it as well, so the picture is
 * in the scene's or session's list it was added from. Added to the story's
 * own list it is the story's and nothing more: the story shows a file only
 * as its cover, which is sa_setAttachmentCover's to make.
 *
 * A create form's first upload has no holder yet -- idExternal is null and
 * there is nothing to own, so the row has no story until a use claims it.
 * Once a holder is named, though, the caller's right to attach to it is
 * checked the same way the board's reads check it: this is a request the UI
 * should never have made, so it is thrown rather than answered with an empty
 * result.
 */
export async function sa_createAttachment(input: {
  kind: AttachmentKind;
  idExternal: number | null;
  url?: string;
  fileName?: string;
  contentType?: string;
  byteSize?: number;
}): Promise<{ idAttachment: number; status: string }> {
  const user = await requireAccount();
  const kind = attachmentKindSchema.parse(input.kind);
  const idExternal = idExternalSchema.nullable().parse(input.idExternal);
  // What the browser said about the file, bounded before it reaches the row.
  const file = attachmentFileSchema.parse(input);

  let idStory: number | null = null;
  if (idExternal !== null) {
    const holder = await holderStory(user.id, kind, idExternal);
    if (holder.refused !== null) throw new Error(refusal(holder));
    idStory = holder.idStory;
  }

  // A url means a typed link, which is READY at once. No url means an upload
  // is about to start, so the row exists to be marked ready or failed. The
  // url is pinned to http(s) before it is stored: it is shown later inside a
  // CSS url("…") on the story card, and a link is the one attachment a caller
  // types themselves rather than one Blob hands back.
  const url = input.url ? attachmentUrlSchema.parse(input.url) : null;
  const isLink = url !== null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(attachments)
      .values({
        idStory,
        status: isLink ? "READY" : sql`DEFAULT`,
        url,
        isUploaded: !isLink,
        fileName: file.fileName ?? null,
        contentType: file.contentType ?? null,
        byteSize: file.byteSize ?? null,
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })
      .returning({ idAttachment: attachments.idAttachment, status: attachments.status });
    if (idExternal !== null && kind !== "STORY") {
      await tx.insert(attachmentUses).values({
        idAttachment: row.idAttachment,
        kind,
        idExternal,
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      });
    }
    return row;
  });
}

/**
 * Moves an upload from UPLOADING to READY once Blob confirms the file
 * landed, and records where it landed. url is client-supplied and, beyond
 * the http(s) rule every attachment url passes, otherwise unconstrained -- a
 * typed external link is legal here too, and is how sa_createAttachment's
 * own READY rows work -- but a Blob url that is not the caller's own is
 * refused. Without this check a caller could point a row they own at another
 * user's key, and sa_deleteAttachment's later isOwnUploadedBlobUrl guard
 * would not save the victim: the row really would be "ours" to delete, only
 * the key would not be.
 */
export async function sa_markAttachmentReady(id: number, url: string): Promise<void> {
  const user = await requireAccount();
  const attachmentId = idAttachmentSchema.parse(id);
  // Pinned to http(s) like a typed link, for the same reason: this row's url
  // is what the story card puts inside a CSS url("…"). Blob's own urls always
  // pass, so the only caller this refuses is one that did not come from an
  // upload at all.
  const readyUrl = attachmentUrlSchema.parse(url);

  if (isUploadedBlobUrl(readyUrl) && !isOwnUploadedBlobUrl(readyUrl, user.id)) {
    throw new Error("That upload does not belong to you.");
  }

  await db
    .update(attachments)
    .set({ status: "READY", url: readyUrl, idUpdatedByUser: user.id })
    .where(
      and(eq(attachments.idAttachment, attachmentId), eq(attachments.idCreatedByUser, user.id)),
    );
}

/** Moves an upload from UPLOADING to ERROR when Blob reports a failure. */
export async function sa_markAttachmentError(id: number): Promise<void> {
  const user = await requireAccount();
  const attachmentId = idAttachmentSchema.parse(id);
  await db
    .update(attachments)
    .set({ status: "ERROR", idUpdatedByUser: user.id })
    .where(
      and(eq(attachments.idAttachment, attachmentId), eq(attachments.idCreatedByUser, user.id)),
    );
}

/** Moves a failed upload from ERROR back to UPLOADING so the field can try again. */
export async function sa_retryAttachment(id: number): Promise<void> {
  const user = await requireAccount();
  const attachmentId = idAttachmentSchema.parse(id);
  await db
    .update(attachments)
    .set({ status: "UPLOADING", idUpdatedByUser: user.id })
    .where(
      and(eq(attachments.idAttachment, attachmentId), eq(attachments.idCreatedByUser, user.id)),
    );
}

/**
 * Removes an attachment, and with it every use of it (the foreign key
 * cascades). The row is read first so ownership can be checked before
 * anything else happens; a mismatch is thrown, the same treatment
 * sa_updateStory gives a story someone else created, since the caller cannot
 * fix "not yours" and does not need to be told which of "not yours" or "not
 * there" it was.
 *
 * The row is deleted before Blob is asked to remove anything, not after: if
 * del() ran first and the row delete then failed, the attachment would be
 * left pointing at a 404. Deleting the row first and having a blob call
 * fail instead just leaves an orphaned blob, which the sweep collects.
 *
 * Blob's del() is called only when isUploaded is true (this file is ours to
 * remove, not a link someone typed) and the url is one of ours to delete --
 * two conditions that do not imply each other, since isUploaded is recorded
 * at write time rather than re-derived from the url. "Ours to delete" is
 * isOwnUploadedBlobUrl, which also proves the key sits under this user's own
 * uploads/<user-id>/ prefix; isUploadedBlobUrl alone only proves the host is
 * Blob's, which a row's own url could satisfy while pointing at someone
 * else's key (sa_markAttachmentReady refuses to write such a url, but this
 * guard does not rely on that alone).
 */
export async function sa_deleteAttachment(
  id: number,
  options: { dropDrawing?: boolean } = {},
): Promise<void> {
  const user = await requireAccount();
  const attachmentId = idAttachmentSchema.parse(id);

  const [row] = await db
    .select({
      idCreatedByUser: attachments.idCreatedByUser,
      idStory: attachments.idStory,
      isUploaded: attachments.isUploaded,
      url: attachments.url,
    })
    .from(attachments)
    .where(eq(attachments.idAttachment, attachmentId))
    .limit(1);
  if (!row || row.idCreatedByUser !== user.id) {
    throw new Error("Attachment not found");
  }

  // A picture's drawing goes with the file (the foreign key cascades), so a
  // file with a drawing on it is deleted only once the storyteller has
  // confirmed that (`dropDrawing`). The file's row is locked first, which
  // holds back a drawing being made on it meanwhile, so none is deleted
  // unconfirmed. The elements and links showing it are read before their
  // uses go with it, to be sent again once it is gone.
  const drawn = await db.transaction(async (tx) => {
    await tx
      .select({ idAttachment: attachments.idAttachment })
      .from(attachments)
      .where(eq(attachments.idAttachment, attachmentId))
      .for("update");
    const [drawing] = await tx
      .select({ playerUrl: attachmentAnnotations.playerUrl })
      .from(attachmentAnnotations)
      .where(eq(attachmentAnnotations.idAttachment, attachmentId));
    if (drawing && options.dropDrawing !== true) throw new Error(DRAWING_WOULD_BE_LOST);
    const shownBy = drawing
      ? await tx
          .select({ kind: attachmentUses.kind, idExternal: attachmentUses.idExternal })
          .from(attachmentUses)
          .where(
            and(
              eq(attachmentUses.idAttachment, attachmentId),
              inArray(attachmentUses.kind, ["ELEMENT", "SCENE_ELEMENT"]),
              useIsCover,
            ),
          )
      : [];
    await tx
      .delete(attachments)
      .where(
        and(eq(attachments.idAttachment, attachmentId), eq(attachments.idCreatedByUser, user.id)),
      );
    return drawing ? { playerUrl: drawing.playerUrl, shownBy } : null;
  });

  if (row.isUploaded && row.url && isOwnUploadedBlobUrl(row.url, user.id)) {
    await del(row.url);
  }
  // The players' copy the drawing was shown by, after the rows are gone, and
  // the elements and links that showed it sent again, since the copy went too.
  if (drawn) {
    if (drawn.playerUrl && isUploadedBlobUrl(drawn.playerUrl)) await del(drawn.playerUrl);
    if (row.idStory !== null) {
      // The kinds the uses were read by, which the column holds as text.
      for (const use of drawn.shownBy) {
        tellPlayers(row.idStory, use.kind as AttachmentKind, use.idExternal);
      }
    }
  }
}

/**
 * Makes an attachment a holder's cover, or stops it being one (setCover and
 * clearCover in db/covers.ts, which say how a cover is kept to one use and
 * why a story's bare use goes with its tag).
 *
 * Only the holder's storyteller may (holderStory), only for a file of that
 * story, and a row that is not READY is refused as well: it has no picture
 * to show. A link to a complete scene is refused with SCENE_COMPLETE.
 */
export async function sa_setAttachmentCover(
  kind: AttachmentKind,
  idExternal: number,
  id: number,
  isCover: boolean,
): Promise<void> {
  const user = await requireAccount();
  const parsedKind = attachmentKindSchema.parse(kind);
  const parsedIdExternal = idExternalSchema.parse(idExternal);
  const attachmentId = idAttachmentSchema.parse(id);

  const access = await holderStory(user.id, parsedKind, parsedIdExternal);
  if (access.refused === "locked") throw new Error(SCENE_COMPLETE);
  if (access.refused !== null) throw new Error("Attachment not found");
  const idStory = access.idStory;
  const [row] = await db
    .select({ status: attachments.status, idStory: attachments.idStory })
    .from(attachments)
    .where(eq(attachments.idAttachment, attachmentId))
    .limit(1);
  if (!row || row.idStory !== idStory) throw new Error("Attachment not found");
  if (isCover && row.status !== "READY") {
    throw new Error("Only a finished attachment can be the cover");
  }

  const holder = { kind: parsedKind, idExternal: parsedIdExternal };
  await db.transaction(async (tx) => {
    if (isCover) await setCover(holder, attachmentId, user.id, tx);
    else await clearCover(holder, user.id, { idAttachment: attachmentId }, tx);
  });
  tellPlayers(idStory, parsedKind, parsedIdExternal);
}

/**
 * Replaces an attachment's own tags: the file's, kept on attachments.tags
 * and searched through search_text. Whether a holder shows the file as its
 * cover is the holder's use, sa_setAttachmentCover's to change, and
 * attachmentTagsSchema refuses the cover tag here. The whole list rather
 * than one tag added or removed, so what the popover shows is what is
 * stored, however its presses interleave.
 */
export async function sa_setAttachmentTags(id: number, tags: string[]): Promise<void> {
  const user = await requireAccount();
  const attachmentId = idAttachmentSchema.parse(id);
  const parsedTags = attachmentTagsSchema.parse(tags);

  await ownedAttachmentStory(user.id, attachmentId);

  await db
    .update(attachments)
    .set({ tags: parsedTags, idUpdatedByUser: user.id })
    .where(eq(attachments.idAttachment, attachmentId));
}

/**
 * The drawing over an attachment, as the card's annotation controls and its
 * remove button need it, or null for none. The file is named as the outer
 * relation and its column, as identifiers, for the reason attachmentUrl
 * gives: a single-table select writes its columns bare, and a bare
 * id_attachment in here would be the drawing's own.
 */
function drawingOf(source: string) {
  return sql<{ isActive: boolean } | null>`(
    select json_build_object('isActive', aa.is_active)
    from attachment_annotations aa
    where aa.id_attachment = ${sql.identifier(source)}.id_attachment
  )`;
}

/**
 * The attachment as the storyteller is shown it: its players' copy while it
 * is annotated and one has been rendered, else the file itself (PictureState
 * says why); named as drawingOf names it.
 */
function shownUrlOf(source: string) {
  const file = sql`${sql.identifier(source)}`;
  return sql<string | null>`coalesce((
    select aa.player_url
    from attachment_annotations aa
    where aa.id_attachment = ${file}.id_attachment and aa.is_active
  ), ${file}.url)`;
}

/**
 * A holder's attachments, in the order a gallery or form shows them. For the
 * story itself, its whole pool: every file it owns, whether or not it shows
 * one (only its cover is a use of the story's own), with the cover first
 * and the rest newest first. For a session, a scene or an element, the
 * files it uses, in its sort order and then newest first. A holder that is
 * not there and one that is someone else's story answer the same way -- an
 * empty list -- exactly as sa_getStoryScene answers null for both, since
 * the board is the storyteller's alone.
 */
export async function sa_listAttachments(
  kind: AttachmentKind,
  idExternal: number,
): Promise<Attachment[]> {
  const user = await requireAccount();

  // A bad kind or an id outside int4 is a query error rather than a missing
  // row, so it is refused the same way an unowned holder is: an empty list.
  const parsedKind = attachmentKindSchema.safeParse(kind);
  const parsedId = idExternalSchema.safeParse(idExternal);
  if (!parsedKind.success || !parsedId.success) return [];

  // A read: a complete scene's pictures are still listed.
  const { idStory } = await holderStory(user.id, parsedKind.data, parsedId.data, {
    allowLocked: true,
  });
  if (idStory === null) return [];

  if (parsedKind.data === "STORY") {
    const rows = await db
      .select({
        idAttachment: attachments.idAttachment,
        idStory: attachments.idStory,
        idAttachmentUse: attachmentUses.idAttachmentUse,
        status: attachments.status,
        url: attachments.url,
        isUploaded: attachments.isUploaded,
        fileName: attachments.fileName,
        isCover: sql<boolean>`coalesce(${useIsCover}, false)`,
        tags: attachments.tags,
        createdAt: attachments.createdAt,
        updatedAt: attachments.updatedAt,
        drawing: drawingOf("attachments"),
        shownUrl: shownUrlOf("attachments"),
        fogCovered: attachmentFogCovered("attachments"),
        fogActive: attachmentFogActive("attachments"),
      })
      .from(attachments)
      .leftJoin(
        attachmentUses,
        and(
          eq(attachmentUses.idAttachment, attachments.idAttachment),
          eq(attachmentUses.kind, "STORY"),
          eq(attachmentUses.idExternal, idStory),
        ),
      )
      .where(eq(attachments.idStory, idStory))
      // The cover first, then newest first by updated_at, which the
      // set_updated_at trigger moves on every change, so a picture just
      // finished or retagged comes to the front. The id breaks ties the
      // same way, since rows inserted in one statement share a timestamp.
      .orderBy(
        sql`${attachmentUses.sortOrder} asc nulls last`,
        desc(attachments.updatedAt),
        desc(attachments.idAttachment),
      );
    return rows.map((row) => ({
      ...row,
      kind: "STORY" as const,
      idExternal: idStory,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }));
  }

  const rows = await db
    .select({
      idAttachment: vAttachmentUses.idAttachment,
      idStory: vAttachmentUses.idStory,
      idAttachmentUse: vAttachmentUses.idAttachmentUse,
      status: vAttachmentUses.status,
      url: vAttachmentUses.url,
      isUploaded: vAttachmentUses.isUploaded,
      fileName: vAttachmentUses.fileName,
      isCover: vAttachmentUses.isCover,
      tags: vAttachmentUses.attachmentTags,
      createdAt: vAttachmentUses.attachmentCreatedAt,
      updatedAt: vAttachmentUses.attachmentUpdatedAt,
      drawing: drawingOf("v_attachment_uses"),
      shownUrl: shownUrlOf("v_attachment_uses"),
      fogCovered: attachmentFogCovered("v_attachment_uses"),
      fogActive: attachmentFogActive("v_attachment_uses"),
    })
    .from(vAttachmentUses)
    .where(
      and(eq(vAttachmentUses.kind, parsedKind.data), eq(vAttachmentUses.idExternal, parsedId.data)),
    )
    .orderBy(
      sql`${vAttachmentUses.sortOrder} asc`,
      desc(vAttachmentUses.updatedAt),
      desc(vAttachmentUses.idAttachmentUse),
    );
  // The view's columns are all nullable to Drizzle, which knows nothing of
  // the NOT NULLs behind them; the rows are the two tables' own.
  return rows.map((row) => ({
    idAttachment: row.idAttachment!,
    idStory: row.idStory,
    kind: parsedKind.data,
    idExternal: parsedId.data,
    idAttachmentUse: row.idAttachmentUse,
    status: row.status!,
    url: row.url,
    isUploaded: row.isUploaded!,
    fileName: row.fileName,
    isCover: row.isCover === true,
    tags: row.tags ?? [],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    drawing: row.drawing,
    shownUrl: row.shownUrl,
    fogCovered: row.fogCovered,
    fogActive: row.fogActive,
  }));
}

/** A timestamp as the Attachment type carries it; the view's are nullable to Drizzle. */
function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

// A search box's contents, bounded like the Scenes column's.

/**
 * Which of a holder's attachments match what a search box holds, by
 * attachments.search_text: the address, the file name and every tag of the
 * file. Ids rather than rows, because the field asking already holds every
 * row and only needs to know which to show.
 * The story's pool for the story itself, as sa_listAttachments lists it. An
 * unowned or unusable holder answers like sa_listAttachments does, with
 * nothing.
 */
export async function sa_searchAttachments(
  kind: AttachmentKind,
  idExternal: number,
  query: string,
): Promise<number[]> {
  const user = await requireAccount();

  const parsedKind = attachmentKindSchema.safeParse(kind);
  const parsedId = idExternalSchema.safeParse(idExternal);
  const needle = searchSchema.safeParse(query);
  if (!parsedKind.success || !parsedId.success || !needle.success) return [];

  const { idStory } = await holderStory(user.id, parsedKind.data, parsedId.data, {
    allowLocked: true,
  });
  if (idStory === null) return [];

  const matches = needle.data === "" ? undefined : likeContains(needle.data);
  if (parsedKind.data === "STORY") {
    const rows = await db
      .select({ idAttachment: attachments.idAttachment })
      .from(attachments)
      .where(
        and(
          eq(attachments.idStory, idStory),
          matches === undefined ? undefined : ilike(attachments.searchText, matches),
        ),
      );
    return rows.map((row) => row.idAttachment);
  }
  const rows = await db
    .select({ idAttachment: vAttachmentUses.idAttachment })
    .from(vAttachmentUses)
    .where(
      and(
        eq(vAttachmentUses.kind, parsedKind.data),
        eq(vAttachmentUses.idExternal, parsedId.data),
        matches === undefined ? undefined : ilike(vAttachmentUses.searchText, matches),
      ),
    );
  return rows.map((row) => row.idAttachment!);
}

export type AttachResult = { ok: true; attached: number[] } | { ok: false; error: string };

// What the picker sends: a holder of a kind pictures are attached to, and
// the files, each held to its schema before any reaches a query.
const holderIdsSchema = z.object({
  kind: attachHolderKindSchema,
  idExternal: idExternalSchema,
  ids: attachmentIdsSchema,
});
const holderIdSchema = z.object({
  kind: attachHolderKindSchema,
  idExternal: idExternalSchema,
  id: idAttachmentSchema,
});
export type DetachResult = { ok: true; detached: number[] } | { ok: false; error: string };
export type AttachAsCoverResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * A change to an element's pictures, or a scene element's, is told to the
 * players' table, whose pill shows the link's cover else the element's, and
 * a change to a scene's cover too,
 * since the players' table draws the scene behind its cover and reads it
 * afresh when the scene is said to have changed (publishSceneChanged, which
 * says nothing when the scene is not the one being played). A session's
 * cover is read when its popover opens, so the players do not follow it.
 */
function tellPlayers(idStory: number, kind: AttachmentKind, idExternal: number): void {
  if (kind === "SCENE_ELEMENT") {
    publishLater(() => publishSceneElementPictures(idStory, idExternal));
  } else if (kind === "ELEMENT") {
    publishLater(() => publishElementChanged(idStory, idExternal));
  } else if (kind === "STORY_SCENE") {
    publishLater(() => publishSceneChanged(idStory));
  }
}

/**
 * Gives a holder some of its story's pictures: the story attachment picker's
 * Add button and the arrow beside a story picture in the run page's
 * library. The holder is a session (its edit panel's cover), a scene, or an
 * element's link to one (the element panel's Other images). Each becomes a use of the holder's, so it joins
 * the holder's list; it stays the story's, in the story's list, since a
 * file is the story's whether or not a holder shows it.
 *
 * Only the holder's storyteller may (holderStory), and only files of that
 * story that are READY go: the picker offers no others, and the WHERE
 * repeats each condition so a row that changed since the picker loaded is
 * left alone rather than attached by mistake. One the holder already uses
 * is left as it is. What was attached comes back, for the picker to say.
 * There is no ceiling on how many a holder uses: a story's pool is as big
 * as the storyteller makes it, and a scene may take all of it. A link to a
 * complete scene is refused: its pictures are part of what was played.
 */
export async function sa_attachToHolder(
  kind: AttachHolderKind,
  idExternal: number,
  ids: number[],
): Promise<AttachResult> {
  const user = await requireAccount();
  const asked = holderIdsSchema.safeParse({ kind, idExternal, ids });
  if (!asked.success) return { ok: false, error: NO_ACCESS };
  const { kind: holderKind, idExternal: holderId, ids: parsedIds } = asked.data;
  if (parsedIds.length === 0) return { ok: true, attached: [] };

  const access = await holderStory(user.id, holderKind, holderId);
  if (access.refused !== null) return { ok: false, error: refusal(access) };
  const idStory = access.idStory;

  const result = await db.transaction(async (tx) => {
    // The files the holder does not use yet, of those asked for.
    const candidates = await tx
      .select({ idAttachment: attachments.idAttachment })
      .from(attachments)
      .where(
        and(
          inArray(attachments.idAttachment, parsedIds),
          eq(attachments.idStory, idStory),
          eq(attachments.status, "READY"),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(attachmentUses)
              .where(
                and(
                  eq(attachmentUses.idAttachment, attachments.idAttachment),
                  eq(attachmentUses.kind, holderKind),
                  eq(attachmentUses.idExternal, holderId),
                ),
              ),
          ),
        ),
      );
    if (candidates.length === 0) return { ok: true as const, attached: [] };

    await tx.insert(attachmentUses).values(
      candidates.map((row) => ({
        idAttachment: row.idAttachment,
        kind: holderKind,
        idExternal: holderId,
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })),
    );
    return { ok: true as const, attached: candidates.map((row) => row.idAttachment) };
  });
  if (result.ok && result.attached.length > 0) tellPlayers(idStory, holderKind, holderId);
  return result;
}

/**
 * Takes some pictures off a holder: the arrow beside a scene picture in the
 * run page's library, and the − on an element's picture for a scene in the
 * element panel; the way back from sa_attachToHolder. The holder's use
 * goes, its cover tag with it, so a holder whose cover is taken off is left
 * with none; the file stays the story's, in the story's list.
 *
 * Only the holder's storyteller may. What was detached comes back.
 */
export async function sa_detachFromHolder(
  kind: AttachHolderKind,
  idExternal: number,
  ids: number[],
): Promise<DetachResult> {
  const user = await requireAccount();
  const asked = holderIdsSchema.safeParse({ kind, idExternal, ids });
  if (!asked.success) return { ok: false, error: NO_ACCESS };
  const { kind: holderKind, idExternal: holderId, ids: parsedIds } = asked.data;
  if (parsedIds.length === 0) return { ok: true, detached: [] };

  const access = await holderStory(user.id, holderKind, holderId);
  if (access.refused !== null) return { ok: false, error: refusal(access) };
  const idStory = access.idStory;

  const detached = await db
    .delete(attachmentUses)
    .where(
      and(
        inArray(attachmentUses.idAttachment, parsedIds),
        eq(attachmentUses.kind, holderKind),
        eq(attachmentUses.idExternal, holderId),
      ),
    )
    .returning({ idAttachment: attachmentUses.idAttachment });
  if (detached.length > 0) tellPlayers(idStory, holderKind, holderId);
  return { ok: true, detached: detached.map((row) => row.idAttachment) };
}

/**
 * Gives a holder one of its story's pictures and makes it the holder's
 * cover: the Cover button beside a story picture in the run page's library,
 * while the table is on a scene, and the element panel's + for an element's
 * picture in this scene. The url comes back for whatever shows the cover:
 * the play space behind its stacks, or the pill.
 *
 * The attach is sa_attachToHolder's, with its conditions: only the holder's
 * storyteller, and only a READY file of that story. The cover is then
 * setCover's, taking the tag off whichever of the holder's pictures held it
 * first. Both in one transaction, so a refusal leaves the holder as it was
 * rather than using the file but not as its cover. A link to a complete
 * scene is refused, as attaching to it is.
 */
export async function sa_attachAsCover(
  kind: AttachHolderKind,
  idExternal: number,
  id: number,
): Promise<AttachAsCoverResult> {
  const user = await requireAccount();
  const asked = holderIdSchema.safeParse({ kind, idExternal, id });
  if (!asked.success) return { ok: false, error: NO_ACCESS };
  const { kind: holderKind, idExternal: holderId, id: attachmentId } = asked.data;

  const access = await holderStory(user.id, holderKind, holderId);
  if (access.refused !== null) return { ok: false, error: refusal(access) };
  const idStory = access.idStory;
  const noun = ATTACH_HOLDER_NOUNS[holderKind];

  const result = await db.transaction(async (tx) => {
    const [file] = await tx
      .select({ url: attachments.url })
      .from(attachments)
      .where(
        and(
          eq(attachments.idAttachment, attachmentId),
          eq(attachments.idStory, idStory),
          eq(attachments.status, "READY"),
        ),
      )
      .limit(1);
    if (!file?.url) {
      return {
        ok: false as const,
        error: `That attachment can no longer be used by the ${noun}.`,
      };
    }
    await setCover({ kind: holderKind, idExternal: holderId }, attachmentId, user.id, tx);
    return { ok: true as const, url: file.url };
  });
  if (result.ok) tellPlayers(idStory, holderKind, holderId);
  return result;
}
