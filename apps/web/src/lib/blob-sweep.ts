/** How long a blob or an unclaimed attachment is left alone before the sweep will consider it an orphan. */
export const GRACE_MS = 24 * 60 * 60 * 1000;

type SweepableBlob = { url: string; uploadedAt: Date };

/**
 * Which blobs the sweep should delete: the ones no row points at any more.
 *
 * The grace period is what makes this safe rather than a race. An image
 * uploaded into a form the user has not submitted yet is referenced by
 * nothing, so without it the sweep would delete that image mid-edit. A blob
 * exactly on the boundary is kept, because the cheap mistake is waiting
 * another day and the expensive one is deleting a picture someone is using.
 */
export function staleBlobs(blobs: SweepableBlob[], referenced: Set<string>, now: Date): string[] {
  const cutoff = now.getTime() - GRACE_MS;
  return blobs
    .filter((blob) => !referenced.has(blob.url) && blob.uploadedAt.getTime() < cutoff)
    .map((blob) => blob.url);
}

type SweepableAttachmentRow = { idAttachment: number; idExternal: number | null; createdAt: Date };

/**
 * Which attachment rows the sweep should delete: rows still `UPLOADING`
 * because the form they belong to was never submitted.
 *
 * Shares its grace period and boundary rule with `staleBlobs` for the same
 * reason — an upload the user is still in the middle of attaching has a null
 * `external_id` and no other row references it, and the sweep must not pull
 * it out from under them.
 */
export function unclaimedAttachmentIds(rows: SweepableAttachmentRow[], now: Date): number[] {
  const cutoff = now.getTime() - GRACE_MS;
  return rows
    .filter((row) => row.idExternal === null && row.createdAt.getTime() < cutoff)
    .map((row) => row.idAttachment);
}
