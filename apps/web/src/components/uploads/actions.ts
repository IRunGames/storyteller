"use server";

import { and, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { del } from "@vercel/blob";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { likeContains } from "@/lib/filter-text";
import { isOwnUploadedBlobUrl, isUploadedBlobUrl } from "@/lib/image-uploads";
import {
  attachmentIdsSchema,
  attachmentKindSchema,
  attachmentTagsSchema,
  attachmentUrlSchema,
  idAttachmentSchema,
  idExternalSchema,
} from "@/lib/attachment-schemas";
import {
  COVER_TAG,
  MAX_ATTACHMENTS,
  type Attachment,
  type AttachmentKind,
} from "@/lib/attachments";

const { attachments, stories, storySessions, storyScenes } = schema;

// tags @> '{cover}', the predicate attachments_one_cover_idx is built on, so
// the planner can match it to the index; = ANY would not.
const isCoverSql = sql<boolean>`${attachments.tags} @> array[${COVER_TAG}]::text[]`;

/**
 * Whether the caller may reach the story, session or scene a kind and
 * external id name -- proven by walking to the story and comparing its
 * creator, the same way the board's own reads prove it. The exists-trigger
 * (tr_biu_attachments_external_exists) only proves the parent row is there;
 * it is a backstop against a bad id, never the authorisation.
 */
async function ownsAttachmentParent(
  userId: string,
  kind: AttachmentKind,
  idExternal: number,
): Promise<boolean> {
  switch (kind) {
    case "STORY": {
      const [row] = await db
        .select({ owner: stories.idCreatedByUser })
        .from(stories)
        .where(eq(stories.idStory, idExternal))
        .limit(1);
      return row?.owner === userId;
    }
    case "STORY_SESSION": {
      const [row] = await db
        .select({ owner: stories.idCreatedByUser })
        .from(storySessions)
        .innerJoin(stories, eq(stories.idStory, storySessions.idStory))
        .where(eq(storySessions.idStorySession, idExternal))
        .limit(1);
      return row?.owner === userId;
    }
    case "STORY_SCENE": {
      const [row] = await db
        .select({ owner: stories.idCreatedByUser })
        .from(storyScenes)
        .innerJoin(stories, eq(stories.idStory, storyScenes.idStory))
        .where(eq(storyScenes.idStoryScene, idExternal))
        .limit(1);
      return row?.owner === userId;
    }
  }
}

/**
 * Starts an attachment: a typed link is READY at once because nothing more
 * has to happen to it, while a file about to be uploaded needs a row to be
 * marked ready or failed once Blob has it. idCreatedByUser and
 * idUpdatedByUser come from the session, never from the client.
 *
 * A create form's first upload has no parent yet -- idExternal is null and
 * there is nothing to own. Once a parent is named, though, the caller's
 * right to attach to it is checked the same way the board's reads check it:
 * this is a request the UI should never have made, so it is thrown rather
 * than answered with an empty result.
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

  if (idExternal !== null) {
    const owns = await ownsAttachmentParent(user.id, kind, idExternal);
    if (!owns) throw new Error("You do not have access to that story.");
  }

  // A url means a typed link, which is READY at once. No url means an upload
  // is about to start, so the row exists to be marked ready or failed. The
  // url is pinned to http(s) before it is stored: it is shown later inside a
  // CSS url("…") on the story card, and a link is the one attachment a caller
  // types themselves rather than one Blob hands back.
  const url = input.url ? attachmentUrlSchema.parse(input.url) : null;
  const isLink = url !== null;
  const [row] = await db
    .insert(attachments)
    .values({
      kind,
      idExternal,
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
  return row;
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
 * Removes an attachment. The row is read first so ownership can be checked
 * before anything else happens; a mismatch is thrown, the same treatment
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
 * An attachment on an object the caller is the storyteller of, or a throw.
 * Covers and tags are choices about the story, so the authority is the
 * object's storyteller rather than whoever uploaded the row. A row that is
 * not there, is detached (no object to own yet), or sits on someone else's
 * object answers the same way, like sa_deleteAttachment's "not yours": the
 * UI never offers any of them, and the caller need not learn which it was.
 */
async function findAttachmentOnOwnedParent(userId: string, attachmentId: number) {
  const [row] = await db
    .select({
      kind: attachments.kind,
      idExternal: attachments.idExternal,
      status: attachments.status,
    })
    .from(attachments)
    .where(eq(attachments.idAttachment, attachmentId))
    .limit(1);
  if (
    !row ||
    row.idExternal === null ||
    !(await ownsAttachmentParent(userId, row.kind as AttachmentKind, row.idExternal))
  ) {
    throw new Error("Attachment not found");
  }
  return { ...row, idExternal: row.idExternal };
}

/**
 * Makes an attachment its object's cover, or stops it being one. Making one
 * the cover takes the tag off whichever sibling held it, in the same
 * transaction and before the tag is added, since attachments_one_cover_idx
 * would refuse two at once. Every other tag a row carries is left alone.
 *
 * Only the object's storyteller may (findAttachmentOnOwnedParent), and a row
 * that is not READY is refused as well: it has no picture to show.
 */
export async function sa_setAttachmentCover(id: number, isCover: boolean): Promise<void> {
  const user = await requireUser();
  const attachmentId = idAttachmentSchema.parse(id);

  const row = await findAttachmentOnOwnedParent(user.id, attachmentId);
  if (isCover && row.status !== "READY") {
    throw new Error("Only a finished attachment can be the cover");
  }
  const { kind, idExternal } = row;

  await db.transaction(async (tx) => {
    if (isCover) {
      await tx
        .update(attachments)
        .set({
          tags: sql`array_remove(${attachments.tags}, ${COVER_TAG})`,
          idUpdatedByUser: user.id,
        })
        .where(
          and(
            eq(attachments.kind, kind),
            eq(attachments.idExternal, idExternal),
            isCoverSql,
            sql`${attachments.idAttachment} <> ${attachmentId}`,
          ),
        );
      await tx
        .update(attachments)
        .set({
          tags: sql`array_append(${attachments.tags}, ${COVER_TAG})`,
          idUpdatedByUser: user.id,
        })
        .where(and(eq(attachments.idAttachment, attachmentId), sql`not ${isCoverSql}`));
    } else {
      await tx
        .update(attachments)
        .set({
          tags: sql`array_remove(${attachments.tags}, ${COVER_TAG})`,
          idUpdatedByUser: user.id,
        })
        .where(and(eq(attachments.idAttachment, attachmentId), isCoverSql));
    }
  });
}

/**
 * Replaces an attachment's tags, all but cover: whether the row is its
 * object's cover is sa_setAttachmentCover's to change, so the cover tag is
 * kept exactly as it was, and attachmentTagsSchema refuses one in `tags`.
 * The whole list rather than one tag added or removed, so what the popover
 * shows is what is stored, however its presses interleave.
 */
export async function sa_setAttachmentTags(id: number, tags: string[]): Promise<void> {
  const user = await requireUser();
  const attachmentId = idAttachmentSchema.parse(id);
  const parsedTags = attachmentTagsSchema.parse(tags);

  await findAttachmentOnOwnedParent(user.id, attachmentId);

  // Spelled out element by element: Drizzle expands a JS array in a sql
  // template into a parenthesised list, not a Postgres array. array[] with
  // nothing in it is still a valid text[] once cast.
  const next = sql`array[${sql.join(
    parsedTags.map((tag) => sql`${tag}`),
    sql`, `,
  )}]::text[]`;
  await db
    .update(attachments)
    .set({
      tags: sql`${next} || case when ${isCoverSql} then array[${COVER_TAG}]::text[] else '{}'::text[] end`,
      idUpdatedByUser: user.id,
    })
    .where(eq(attachments.idAttachment, attachmentId));
}

/**
 * An object's attachments, newest first, in the order a gallery or form
 * shows them. A
 * parent that is not there and a parent that is someone else's story answer
 * the same way -- an empty list -- exactly as sa_getStoryScene answers null
 * for both, since the board is the storyteller's alone.
 */
export async function sa_listAttachments(
  kind: AttachmentKind,
  idExternal: number,
): Promise<Attachment[]> {
  const user = await requireUser();

  // A bad kind or an id outside int4 is a query error rather than a missing
  // row, so it is refused the same way an unowned parent is: an empty list.
  const parsedKind = attachmentKindSchema.safeParse(kind);
  const parsedId = idExternalSchema.safeParse(idExternal);
  if (!parsedKind.success || !parsedId.success) return [];

  if (!(await ownsAttachmentParent(user.id, parsedKind.data, parsedId.data))) return [];

  const rows = await db
    .select({
      idAttachment: attachments.idAttachment,
      kind: attachments.kind,
      idExternal: attachments.idExternal,
      status: attachments.status,
      url: attachments.url,
      isUploaded: attachments.isUploaded,
      fileName: attachments.fileName,
      isCover: isCoverSql,
      tags: sql<string[]>`array_remove(${attachments.tags}, ${COVER_TAG})`,
    })
    .from(attachments)
    .where(and(eq(attachments.kind, parsedKind.data), eq(attachments.idExternal, parsedId.data)))
    // Newest first by updated_at, which the set_updated_at trigger moves on
    // every change, so a picture just finished, retagged or made the cover
    // comes to the front. The id breaks ties the same way, since rows
    // inserted in one statement (the seed's) share a timestamp.
    .orderBy(desc(attachments.updatedAt), desc(attachments.idAttachment));

  // The kind column is a plain varchar in Drizzle (Postgres cannot point one
  // foreign key at three tables, so nothing narrows it at the schema level),
  // but the WHERE above already restricts every row to the kind asked for.
  return rows.map((row) => ({ ...row, kind: row.kind as AttachmentKind }));
}

// A search box's contents, bounded like the Scenes column's.
const attachmentQuerySchema = z.string().max(200);

/**
 * Which of an object's attachments match what a search box holds, by
 * attachments.search_text: the address, the file name and every tag, cover
 * included. Ids rather than rows, because the field asking already holds
 * every row (an object has at most twenty) and only needs to know which to
 * show. An unowned or unusable parent answers like sa_listAttachments does,
 * with nothing.
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

  if (!(await ownsAttachmentParent(user.id, parsedKind.data, parsedId.data))) return [];

  const rows = await db
    .select({ idAttachment: attachments.idAttachment })
    .from(attachments)
    .where(
      and(
        eq(attachments.kind, parsedKind.data),
        eq(attachments.idExternal, parsedId.data),
        needle === "" ? undefined : ilike(attachments.searchText, likeContains(needle)),
      ),
    );
  return rows.map((row) => row.idAttachment);
}

/**
 * Attaches uploaded-but-unclaimed rows to the object a create form just
 * saved. This is the security boundary of the whole feature, so every
 * condition in the WHERE carries its own weight: `id_attachment = ANY(ids)`
 * is the set the form collected; `kind = $kind` stops a story picture being
 * claimed as a scene's; `external_id IS NULL` stops re-pointing an
 * attachment already sitting on someone else's object; and
 * `id_created_by_user = caller` stops claiming an attachment the caller
 * never uploaded. A claim that matches nothing is ignored rather than
 * raised -- a double-submitted form must not fail, and the user could do
 * nothing about it if it did.
 *
 * None of those four conditions says anything about the destination,
 * though: they prove the rows are the caller's own, detached, and of the
 * right kind, not that the caller may attach to the parent named by kind
 * and idExternal. Without this check, a caller could upload a picture of
 * their own -- entirely legitimate, it is the create-form path -- leave it
 * detached, and then claim it onto someone else's story, session or scene.
 * A claim aimed elsewhere is a request the UI should never make, so it is
 * thrown rather than silently ignored the way a merely-unmatched id is, and
 * it is checked before the UPDATE runs so a refusal never leaves the rows
 * partly claimed.
 *
 * This runs on the module-level `db`, the pooled connection, not inside a
 * caller's transaction -- there is no `tx` parameter for one to hand in. A
 * create action that inserts its parent and then calls this must commit the
 * insert first: an ownsAttachmentParent lookup made from a different pooled
 * connection cannot see an uncommitted row, and would refuse a claim that
 * should have succeeded. Do not call this from inside `db.transaction(...)`.
 */
export async function sa_claimAttachments(
  kind: AttachmentKind,
  idExternal: number,
  ids: number[],
): Promise<void> {
  const user = await requireUser();
  const parsedKind = attachmentKindSchema.parse(kind);
  const parsedIdExternal = idExternalSchema.parse(idExternal);
  const parsedIds = attachmentIdsSchema.parse(ids);
  if (parsedIds.length === 0) return;

  if (!(await ownsAttachmentParent(user.id, parsedKind, parsedIdExternal))) {
    throw new Error("You do not have access to that story.");
  }

  await db
    .update(attachments)
    .set({ idExternal: parsedIdExternal, idUpdatedByUser: user.id, updatedAt: new Date() })
    .where(
      and(
        inArray(attachments.idAttachment, parsedIds),
        eq(attachments.kind, parsedKind),
        isNull(attachments.idExternal),
        eq(attachments.idCreatedByUser, user.id),
      ),
    );
}

export type MoveAttachmentsResult = { ok: true; moved: number[] } | { ok: false; error: string };

/**
 * Moves some of a story's own attachments onto one of its scenes: the
 * story attachment picker's Add button. Each row's kind and external_id are
 * repointed at the scene, so it leaves the story's list and joins the
 * scene's; tr_attachments_set_id_story keeps id_story on the same story.
 *
 * Only the scene's storyteller may (ownsAttachmentParent), and only rows
 * that are still the story's own, READY and not its cover are moved: the
 * picker offers no others, and the WHERE repeats each condition so a row
 * that changed since the picker loaded is left where it is rather than
 * moved by mistake. What did move comes back, for the picker to drop.
 *
 * The scene is held to MAX_ATTACHMENTS like an upload is. The count and the
 * move run in one transaction, with the scene row locked, so two moves at
 * once cannot each find room for the same last places.
 */
export async function sa_moveStoryAttachmentsToScene(
  idStoryScene: number,
  ids: number[],
): Promise<MoveAttachmentsResult> {
  const user = await requireUser();
  const sceneId = idExternalSchema.parse(idStoryScene);
  const parsedIds = attachmentIdsSchema.parse(ids);
  if (parsedIds.length === 0) return { ok: true, moved: [] };

  if (!(await ownsAttachmentParent(user.id, "STORY_SCENE", sceneId))) {
    throw new Error("You do not have access to that story.");
  }

  return db.transaction(async (tx) => {
    const [scene] = await tx
      .select({ idStory: storyScenes.idStory })
      .from(storyScenes)
      .where(eq(storyScenes.idStoryScene, sceneId))
      .for("update")
      .limit(1);
    if (!scene) throw new Error("Scene not found");

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(attachments)
      .where(and(eq(attachments.kind, "STORY_SCENE"), eq(attachments.idExternal, sceneId)));
    if (count + parsedIds.length > MAX_ATTACHMENTS) {
      const room = Math.max(MAX_ATTACHMENTS - count, 0);
      return {
        ok: false as const,
        error:
          room === 0
            ? `This scene already has ${MAX_ATTACHMENTS} attachments. Remove one first.`
            : `This scene has room for ${room} more. Choose fewer.`,
      };
    }

    const moved = await tx
      .update(attachments)
      .set({ kind: "STORY_SCENE", idExternal: sceneId, idUpdatedByUser: user.id })
      .where(
        and(
          inArray(attachments.idAttachment, parsedIds),
          eq(attachments.kind, "STORY"),
          eq(attachments.idExternal, scene.idStory),
          eq(attachments.status, "READY"),
          sql`not ${isCoverSql}`,
        ),
      )
      .returning({ idAttachment: attachments.idAttachment });
    return { ok: true as const, moved: moved.map((row) => row.idAttachment) };
  });
}
