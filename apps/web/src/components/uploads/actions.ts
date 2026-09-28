"use server";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authorize";
import { isUploadedBlobUrl } from "@/lib/image-uploads";
import type { Attachment, AttachmentKind } from "@/lib/attachments";

const { attachments, stories, storySessions, storyScenes } = schema;

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

  if (input.idExternal !== null) {
    const owns = await ownsAttachmentParent(user.id, input.kind, input.idExternal);
    if (!owns) throw new Error("You do not have access to that story.");
  }

  // A url means a typed link, which is READY at once. No url means an upload
  // is about to start, so the row exists to be marked ready or failed.
  const isLink = !!input.url;
  const [row] = await db
    .insert(attachments)
    .values({
      kind: input.kind,
      idExternal: input.idExternal,
      status: isLink ? "READY" : sql`DEFAULT`,
      url: input.url ?? null,
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

/** Moves an upload from UPLOADING to READY once Blob confirms the file landed. */
export async function sa_markAttachmentReady(id: number, url: string): Promise<void> {
  const user = await requireUser();
  await db
    .update(attachments)
    .set({ status: "READY", url, idUpdatedByUser: user.id })
    .where(and(eq(attachments.idAttachment, id), eq(attachments.idCreatedByUser, user.id)));
}

/** Moves an upload from UPLOADING to ERROR when Blob reports a failure. */
export async function sa_markAttachmentError(id: number): Promise<void> {
  const user = await requireUser();
  await db
    .update(attachments)
    .set({ status: "ERROR", idUpdatedByUser: user.id })
    .where(and(eq(attachments.idAttachment, id), eq(attachments.idCreatedByUser, user.id)));
}

/** Moves a failed upload from ERROR back to UPLOADING so the field can try again. */
export async function sa_retryAttachment(id: number): Promise<void> {
  const user = await requireUser();
  await db
    .update(attachments)
    .set({ status: "UPLOADING", idUpdatedByUser: user.id })
    .where(and(eq(attachments.idAttachment, id), eq(attachments.idCreatedByUser, user.id)));
}

/**
 * Removes an attachment. The row is read first so ownership can be checked
 * before anything else happens; a mismatch is thrown, the same treatment
 * sa_updateStory gives a story someone else created, since the caller cannot
 * fix "not yours" and does not need to be told which of "not yours" or "not
 * there" it was. Blob's del() is called only when isUploaded is true (this
 * file is ours to remove, not a link someone typed) and the url is still one
 * of ours to delete -- two conditions that do not imply each other, since
 * isUploaded is recorded at write time rather than re-derived from the url.
 */
export async function sa_deleteAttachment(id: number): Promise<void> {
  const user = await requireUser();

  const [row] = await db
    .select({
      idCreatedByUser: attachments.idCreatedByUser,
      isUploaded: attachments.isUploaded,
      url: attachments.url,
    })
    .from(attachments)
    .where(eq(attachments.idAttachment, id))
    .limit(1);
  if (!row || row.idCreatedByUser !== user.id) {
    throw new Error("Attachment not found");
  }

  if (row.isUploaded && row.url && isUploadedBlobUrl(row.url)) {
    await del(row.url);
  }

  await db
    .delete(attachments)
    .where(and(eq(attachments.idAttachment, id), eq(attachments.idCreatedByUser, user.id)));
}

/**
 * An object's attachments, in the order a gallery or form shows them. A
 * parent that is not there and a parent that is someone else's story answer
 * the same way -- an empty list -- exactly as sa_getStoryScene answers null
 * for both, since the board is the storyteller's alone.
 */
export async function sa_listAttachments(
  kind: AttachmentKind,
  idExternal: number,
): Promise<Attachment[]> {
  const user = await requireUser();
  if (!(await ownsAttachmentParent(user.id, kind, idExternal))) return [];

  const rows = await db
    .select({
      idAttachment: attachments.idAttachment,
      kind: attachments.kind,
      idExternal: attachments.idExternal,
      status: attachments.status,
      url: attachments.url,
      isUploaded: attachments.isUploaded,
      fileName: attachments.fileName,
    })
    .from(attachments)
    .where(and(eq(attachments.kind, kind), eq(attachments.idExternal, idExternal)))
    .orderBy(asc(attachments.sortOrder), asc(attachments.idAttachment));

  // The kind column is a plain varchar in Drizzle (Postgres cannot point one
  // foreign key at three tables, so nothing narrows it at the schema level),
  // but the WHERE above already restricts every row to the kind asked for.
  return rows.map((row) => ({ ...row, kind: row.kind as AttachmentKind }));
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
 * The create actions insert the parent and claim inside the same
 * transaction, so by the time a legitimate claim runs the caller already
 * owns what they just created and this check passes; a claim aimed
 * elsewhere is a request the UI should never make, so it is thrown rather
 * than silently ignored the way a merely-unmatched id is.
 */
export async function sa_claimAttachments(
  kind: AttachmentKind,
  idExternal: number,
  ids: number[],
): Promise<void> {
  const user = await requireUser();
  if (ids.length === 0) return;

  if (!(await ownsAttachmentParent(user.id, kind, idExternal))) {
    throw new Error("You do not have access to that story.");
  }

  await db
    .update(attachments)
    .set({ idExternal, idUpdatedByUser: user.id, updatedAt: new Date() })
    .where(
      and(
        inArray(attachments.idAttachment, ids),
        eq(attachments.kind, kind),
        isNull(attachments.idExternal),
        eq(attachments.idCreatedByUser, user.id),
      ),
    );
}
