"use server";

import { and, desc, eq, ilike, inArray, notExists, sql } from "drizzle-orm";
import { del } from "@vercel/blob";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { likeContains } from "@/lib/filter-text";
import { isOwnUploadedBlobUrl, isUploadedBlobUrl } from "@/lib/image-uploads";
import {
  attachHolderKindSchema,
  attachmentIdsSchema,
  attachmentKindSchema,
  attachmentTagsSchema,
  attachmentUrlSchema,
  idAttachmentSchema,
  idExternalSchema,
} from "@/lib/attachment-schemas";
import {
  ATTACH_HOLDER_NOUNS,
  COVER_TAG,
  MAX_ATTACHMENTS,
  type AttachHolderKind,
  type Attachment,
  type AttachmentKind,
} from "@/lib/attachments";
import { publishLater } from "@/lib/realtime/publish";
import { publishSceneElementPictures } from "@/lib/realtime/publish-scene";

const {
  attachments,
  attachmentUses,
  vAttachmentUses,
  stories,
  storySessions,
  storyScenes,
  sceneElements,
  elements,
} = schema;

// tags @> '{cover}', the predicate attachment_uses_one_cover_idx is built on,
// so the planner can match it to the index; = ANY would not.
const useIsCoverSql = sql<boolean>`${attachmentUses.tags} @> array[${COVER_TAG}]::text[]`;

/**
 * The story a holder belongs to, when the caller is its storyteller: null
 * otherwise, and for a holder that is not there. A story is its own; a
 * session, a scene or an element names theirs; a scene element's is its
 * scene's, as tr_attachment_uses_same_story reads it. Proven by walking to the
 * story and comparing its creator, the same way the board's own reads prove
 * it. The exists-trigger (tr_biu_attachment_uses_external_exists) only
 * proves the holder row is there; it is a backstop against a bad id, never
 * the authorisation.
 */
async function holderStory(
  userId: string,
  kind: AttachmentKind,
  idExternal: number,
): Promise<number | null> {
  const owned = { idStory: stories.idStory, owner: stories.idCreatedByUser };
  let row: { idStory: number; owner: string | null } | undefined;
  switch (kind) {
    case "STORY":
      [row] = await db.select(owned).from(stories).where(eq(stories.idStory, idExternal)).limit(1);
      break;
    case "STORY_SESSION":
      [row] = await db
        .select(owned)
        .from(storySessions)
        .innerJoin(stories, eq(stories.idStory, storySessions.idStory))
        .where(eq(storySessions.idStorySession, idExternal))
        .limit(1);
      break;
    case "STORY_SCENE":
      [row] = await db
        .select(owned)
        .from(storyScenes)
        .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
        .where(eq(storyScenes.idStoryScene, idExternal))
        .limit(1);
      break;
    case "ELEMENT":
      [row] = await db
        .select(owned)
        .from(elements)
        .innerJoin(stories, eq(stories.idStory, elements.idStory))
        .where(eq(elements.idElement, idExternal))
        .limit(1);
      break;
    case "SCENE_ELEMENT":
      [row] = await db
        .select(owned)
        .from(sceneElements)
        .innerJoin(storyScenes, eq(storyScenes.idStoryScene, sceneElements.idStoryScene))
        .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
        .where(eq(sceneElements.idSceneElement, idExternal))
        .limit(1);
      break;
  }
  return row && row.owner === userId ? row.idStory : null;
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
  const user = await requireUser();
  const kind = attachmentKindSchema.parse(input.kind);
  const idExternal = idExternalSchema.nullable().parse(input.idExternal);

  let idStory: number | null = null;
  if (idExternal !== null) {
    idStory = await holderStory(user.id, kind, idExternal);
    if (idStory === null) throw new Error("You do not have access to that story.");
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
        fileName: input.fileName ?? null,
        contentType: input.contentType ?? null,
        byteSize: input.byteSize ?? null,
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
  const user = await requireUser();
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
  const user = await requireUser();
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
  const user = await requireUser();
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
export async function sa_deleteAttachment(id: number): Promise<void> {
  const user = await requireUser();
  const attachmentId = idAttachmentSchema.parse(id);

  const [row] = await db
    .select({
      idCreatedByUser: attachments.idCreatedByUser,
      isUploaded: attachments.isUploaded,
      url: attachments.url,
    })
    .from(attachments)
    .where(eq(attachments.idAttachment, attachmentId))
    .limit(1);
  if (!row || row.idCreatedByUser !== user.id) {
    throw new Error("Attachment not found");
  }

  await db
    .delete(attachments)
    .where(
      and(eq(attachments.idAttachment, attachmentId), eq(attachments.idCreatedByUser, user.id)),
    );

  if (row.isUploaded && row.url && isOwnUploadedBlobUrl(row.url, user.id)) {
    await del(row.url);
  }
}

/**
 * Makes an attachment a holder's cover, or stops it being one. The cover is
 * the holder's use of the file tagged COVER_TAG: making one the cover takes
 * the tag off whichever of the holder's uses held it, in the same
 * transaction and before the tag is added, since attachment_uses_one_cover_idx
 * would refuse two at once; and the use is made on the spot when the holder
 * had none, which is how a story comes to use a file from its pool. Taking
 * the cover away leaves the use, except a story's: the story shows a file
 * only as its cover, so a STORY use left with no tags means nothing and
 * goes.
 *
 * Only the holder's storyteller may (holderStory), only for a file of that
 * story, and a row that is not READY is refused as well: it has no picture
 * to show.
 */
export async function sa_setAttachmentCover(
  kind: AttachmentKind,
  idExternal: number,
  id: number,
  isCover: boolean,
): Promise<void> {
  const user = await requireUser();
  const parsedKind = attachmentKindSchema.parse(kind);
  const parsedIdExternal = idExternalSchema.parse(idExternal);
  const attachmentId = idAttachmentSchema.parse(id);

  const idStory = await holderStory(user.id, parsedKind, parsedIdExternal);
  if (idStory === null) throw new Error("Attachment not found");
  const [row] = await db
    .select({ status: attachments.status, idStory: attachments.idStory })
    .from(attachments)
    .where(eq(attachments.idAttachment, attachmentId))
    .limit(1);
  if (!row || row.idStory !== idStory) throw new Error("Attachment not found");
  if (isCover && row.status !== "READY") {
    throw new Error("Only a finished attachment can be the cover");
  }

  const holder = and(
    eq(attachmentUses.kind, parsedKind),
    eq(attachmentUses.idExternal, parsedIdExternal),
  );
  await db.transaction(async (tx) => {
    if (isCover) {
      await tx
        .update(attachmentUses)
        .set({
          tags: sql`array_remove(${attachmentUses.tags}, ${COVER_TAG})`,
          idUpdatedByUser: user.id,
        })
        .where(and(holder, useIsCoverSql, sql`${attachmentUses.idAttachment} <> ${attachmentId}`));
      if (parsedKind === "STORY") await dropEmptyStoryUses(tx, parsedIdExternal);
      await tx
        .insert(attachmentUses)
        .values({
          idAttachment: attachmentId,
          kind: parsedKind,
          idExternal: parsedIdExternal,
          tags: [COVER_TAG],
          idCreatedByUser: user.id,
          idUpdatedByUser: user.id,
        })
        .onConflictDoUpdate({
          target: [attachmentUses.idAttachment, attachmentUses.kind, attachmentUses.idExternal],
          set: {
            tags: sql`case when ${useIsCoverSql} then ${attachmentUses.tags} else array_append(${attachmentUses.tags}, ${COVER_TAG}) end`,
            idUpdatedByUser: user.id,
          },
        });
    } else {
      await tx
        .update(attachmentUses)
        .set({
          tags: sql`array_remove(${attachmentUses.tags}, ${COVER_TAG})`,
          idUpdatedByUser: user.id,
        })
        .where(and(holder, eq(attachmentUses.idAttachment, attachmentId), useIsCoverSql));
      if (parsedKind === "STORY") await dropEmptyStoryUses(tx, parsedIdExternal);
    }
  });
  if (parsedKind === "SCENE_ELEMENT") {
    publishLater(() => publishSceneElementPictures(idStory, parsedIdExternal));
  }
}

/**
 * A story shows a file only as its cover, so a STORY use with no tags left
 * says nothing and goes; the file stays in the story's pool regardless.
 */
async function dropEmptyStoryUses(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  idStory: number,
): Promise<void> {
  await tx
    .delete(attachmentUses)
    .where(
      and(
        eq(attachmentUses.kind, "STORY"),
        eq(attachmentUses.idExternal, idStory),
        sql`${attachmentUses.tags} = '{}'::text[]`,
      ),
    );
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
  const user = await requireUser();
  const attachmentId = idAttachmentSchema.parse(id);
  const parsedTags = attachmentTagsSchema.parse(tags);

  await ownedAttachmentStory(user.id, attachmentId);

  await db
    .update(attachments)
    .set({ tags: parsedTags, idUpdatedByUser: user.id })
    .where(eq(attachments.idAttachment, attachmentId));
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
  const user = await requireUser();

  // A bad kind or an id outside int4 is a query error rather than a missing
  // row, so it is refused the same way an unowned holder is: an empty list.
  const parsedKind = attachmentKindSchema.safeParse(kind);
  const parsedId = idExternalSchema.safeParse(idExternal);
  if (!parsedKind.success || !parsedId.success) return [];

  const idStory = await holderStory(user.id, parsedKind.data, parsedId.data);
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
        isCover: sql<boolean>`coalesce(${useIsCoverSql}, false)`,
        tags: attachments.tags,
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
    return rows.map((row) => ({ ...row, kind: "STORY" as const, idExternal: idStory }));
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
  }));
}

// A search box's contents, bounded like the Scenes column's.
const attachmentQuerySchema = z.string().max(200);

/**
 * Which of a holder's attachments match what a search box holds, by
 * attachments.search_text: the address, the file name and every tag of the
 * file. Ids rather than rows, because the field asking already holds every
 * row (a holder has at most twenty) and only needs to know which to show.
 * The story's pool for the story itself, as sa_listAttachments lists it. An
 * unowned or unusable holder answers like sa_listAttachments does, with
 * nothing.
 */
export async function sa_searchAttachments(
  kind: AttachmentKind,
  idExternal: number,
  query: string,
): Promise<number[]> {
  const user = await requireUser();

  const parsedKind = attachmentKindSchema.safeParse(kind);
  const parsedId = idExternalSchema.safeParse(idExternal);
  const needle = attachmentQuerySchema.parse(query).trim();
  if (!parsedKind.success || !parsedId.success) return [];

  const idStory = await holderStory(user.id, parsedKind.data, parsedId.data);
  if (idStory === null) return [];

  const matches = needle === "" ? undefined : likeContains(needle);
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
export type DetachResult = { ok: true; detached: number[] } | { ok: false; error: string };
export type AttachAsCoverResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * The holder's own pictures, counted, with the holder's row locked: the cap
 * and the attach that follows run in one transaction, so two attaches at
 * once cannot each find room for the same last places.
 */
async function lockedHolderCount(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  kind: AttachHolderKind,
  idExternal: number,
): Promise<number> {
  if (kind === "STORY_SCENE") {
    await tx
      .select({ id: storyScenes.idStoryScene })
      .from(storyScenes)
      .where(eq(storyScenes.idStoryScene, idExternal))
      .for("update")
      .limit(1);
  } else {
    await tx
      .select({ id: sceneElements.idSceneElement })
      .from(sceneElements)
      .where(eq(sceneElements.idSceneElement, idExternal))
      .for("update")
      .limit(1);
  }
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(attachmentUses)
    .where(and(eq(attachmentUses.kind, kind), eq(attachmentUses.idExternal, idExternal)));
  return count;
}

/**
 * A change to a scene element's pictures is told to the players' table,
 * whose pill shows the link's cover; a scene's pictures are the storyteller's
 * backdrop and library, which the players do not follow.
 */
function tellPlayers(idStory: number, kind: AttachHolderKind, idExternal: number): void {
  if (kind === "SCENE_ELEMENT") {
    publishLater(() => publishSceneElementPictures(idStory, idExternal));
  }
}

/**
 * Gives a holder some of its story's pictures: the story attachment picker's
 * Add button and the arrow beside a story picture in the run page's
 * library. The holder is a scene, or an element's link to one (the element
 * panel's Other images). Each becomes a use of the holder's, so it joins
 * the holder's list; it stays the story's, in the story's list, since a
 * file is the story's whether or not a holder shows it.
 *
 * Only the holder's storyteller may (holderStory), and only files of that
 * story that are READY go: the picker offers no others, and the WHERE
 * repeats each condition so a row that changed since the picker loaded is
 * left alone rather than attached by mistake. One the holder already uses
 * is left as it is. What was attached comes back, for the picker to say.
 *
 * The holder is held to MAX_ATTACHMENTS like an upload is, counted in the
 * same transaction with the holder's row locked (lockedHolderCount).
 */
export async function sa_attachToHolder(
  kind: AttachHolderKind,
  idExternal: number,
  ids: number[],
): Promise<AttachResult> {
  const user = await requireUser();
  const holderKind = attachHolderKindSchema.parse(kind);
  const holderId = idExternalSchema.parse(idExternal);
  const parsedIds = attachmentIdsSchema.parse(ids);
  if (parsedIds.length === 0) return { ok: true, attached: [] };

  const idStory = await holderStory(user.id, holderKind, holderId);
  if (idStory === null) throw new Error("You do not have access to that story.");
  const noun = ATTACH_HOLDER_NOUNS[holderKind];

  const result = await db.transaction(async (tx) => {
    const count = await lockedHolderCount(tx, holderKind, holderId);

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
    if (count + candidates.length > MAX_ATTACHMENTS) {
      const room = Math.max(MAX_ATTACHMENTS - count, 0);
      return {
        ok: false as const,
        error:
          room === 0
            ? `This ${noun} already has ${MAX_ATTACHMENTS} attachments. Remove one first.`
            : `This ${noun} has room for ${room} more. Choose fewer.`,
      };
    }

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
  const user = await requireUser();
  const holderKind = attachHolderKindSchema.parse(kind);
  const holderId = idExternalSchema.parse(idExternal);
  const parsedIds = attachmentIdsSchema.parse(ids);
  if (parsedIds.length === 0) return { ok: true, detached: [] };

  const idStory = await holderStory(user.id, holderKind, holderId);
  if (idStory === null) throw new Error("You do not have access to that story.");

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
 * storyteller, only a READY file of that story, and only while the holder
 * has room (a file it uses already takes no new place). The cover is then
 * sa_setAttachmentCover's, taking the tag off whichever of the holder's
 * pictures held it first. Both in one transaction with the holder's row
 * locked, so a refusal leaves the holder as it was rather than using the
 * file but not as its cover.
 */
export async function sa_attachAsCover(
  kind: AttachHolderKind,
  idExternal: number,
  id: number,
): Promise<AttachAsCoverResult> {
  const user = await requireUser();
  const holderKind = attachHolderKindSchema.parse(kind);
  const holderId = idExternalSchema.parse(idExternal);
  const attachmentId = idAttachmentSchema.parse(id);

  const idStory = await holderStory(user.id, holderKind, holderId);
  if (idStory === null) throw new Error("You do not have access to that story.");
  const noun = ATTACH_HOLDER_NOUNS[holderKind];

  const result = await db.transaction(async (tx) => {
    const count = await lockedHolderCount(tx, holderKind, holderId);

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
    const [used] = await tx
      .select({ idAttachmentUse: attachmentUses.idAttachmentUse })
      .from(attachmentUses)
      .where(
        and(
          eq(attachmentUses.idAttachment, attachmentId),
          eq(attachmentUses.kind, holderKind),
          eq(attachmentUses.idExternal, holderId),
        ),
      )
      .limit(1);
    if (!used && count >= MAX_ATTACHMENTS) {
      return {
        ok: false as const,
        error: `This ${noun} already has ${MAX_ATTACHMENTS} attachments. Remove one first.`,
      };
    }

    await tx
      .update(attachmentUses)
      .set({
        tags: sql`array_remove(${attachmentUses.tags}, ${COVER_TAG})`,
        idUpdatedByUser: user.id,
      })
      .where(
        and(
          eq(attachmentUses.kind, holderKind),
          eq(attachmentUses.idExternal, holderId),
          useIsCoverSql,
        ),
      );
    await tx
      .insert(attachmentUses)
      .values({
        idAttachment: attachmentId,
        kind: holderKind,
        idExternal: holderId,
        tags: [COVER_TAG],
        idCreatedByUser: user.id,
        idUpdatedByUser: user.id,
      })
      .onConflictDoUpdate({
        target: [attachmentUses.idAttachment, attachmentUses.kind, attachmentUses.idExternal],
        set: {
          tags: sql`array_append(${attachmentUses.tags}, ${COVER_TAG})`,
          idUpdatedByUser: user.id,
        },
      });

    return { ok: true as const, url: file.url };
  });
  if (result.ok) tellPlayers(idStory, holderKind, holderId);
  return result;
}
