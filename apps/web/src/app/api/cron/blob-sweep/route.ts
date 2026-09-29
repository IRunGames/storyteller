import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { del, list } from "@vercel/blob";
import { db, schema } from "@/db";
import { staleBlobs, unclaimedAttachmentIds } from "@/lib/blob-sweep";
import { isUploadedBlobUrl } from "@/lib/image-uploads";

const { attachments } = schema;

/**
 * Deletes what the app left behind: blobs no attachment row points at any
 * more, and attachment rows still `UPLOADING` because the form they belong
 * to was never submitted.
 *
 * Two passes, both gated by the same grace period so neither takes a picture
 * out from under a user still mid-edit:
 *
 * 1. Blobs — the referenced set is one query, every URL an uploaded
 *    attachment currently points at, whatever it is attached to (or not).
 *    `list()` then walks the whole store and anything not in that set, past
 *    the grace period, is deleted.
 * 2. Attachments — rows with a null `external_id` past the grace period were
 *    never claimed by anything. Their blob (if any) is deleted with them.
 *
 * Daily rather than hourly because `list()` is an advanced operation and
 * `del()` is free, so the cost of this job is almost entirely in the listing.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  let deletedBlobs = 0;

  const referencedRows = await db
    .select({ url: attachments.url })
    .from(attachments)
    .where(and(eq(attachments.isUploaded, true), isNotNull(attachments.url)));
  const referenced = new Set(referencedRows.map((row) => row.url as string));

  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 250 });
    const stale = staleBlobs(page.blobs, referenced, now);
    if (stale.length > 0) {
      await del(stale);
      deletedBlobs += stale.length;
    }
    cursor = page.cursor;
  } while (cursor);

  const unclaimedRows = await db
    .select({
      idAttachment: attachments.idAttachment,
      idExternal: attachments.idExternal,
      createdAt: attachments.createdAt,
      url: attachments.url,
      isUploaded: attachments.isUploaded,
    })
    .from(attachments)
    .where(isNull(attachments.idExternal));
  // createdAt is nullable in the schema to allow a manual override; every row
  // this query can see was actually inserted through the default, so this
  // only ever drops rows that could not be swept either way.
  const rowsWithCreatedAt = unclaimedRows.filter(
    (row): row is (typeof unclaimedRows)[number] & { createdAt: Date } => row.createdAt !== null,
  );

  const staleIds = unclaimedAttachmentIds(rowsWithCreatedAt, now);
  let deletedAttachments = 0;

  if (staleIds.length > 0) {
    const staleIdSet = new Set(staleIds);
    // isUploaded is recorded at write time rather than re-derived from url,
    // the same reason sa_deleteAttachment does not trust it alone
    // (components/uploads/actions.ts): the two conditions do not imply each
    // other, so del() is only asked to remove a url that is actually shaped
    // like one of Blob's. Unlike that action, this is a batch sweep with no
    // caller to scope the key to, so the check stops at the host
    // (isUploadedBlobUrl) rather than one user's own prefix.
    const blobUrls = rowsWithCreatedAt
      .filter(
        (row) =>
          staleIdSet.has(row.idAttachment) &&
          row.isUploaded &&
          row.url &&
          isUploadedBlobUrl(row.url),
      )
      .map((row) => row.url as string);
    if (blobUrls.length > 0) {
      await del(blobUrls);
      deletedBlobs += blobUrls.length;
    }

    await db.delete(attachments).where(inArray(attachments.idAttachment, staleIds));
    deletedAttachments = staleIds.length;
  }

  return Response.json({ deletedBlobs, deletedAttachments });
}
