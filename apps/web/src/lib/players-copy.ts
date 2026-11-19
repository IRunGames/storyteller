import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { del, put } from "@vercel/blob";

import { claimRender, commitRender, releaseRender } from "@/db/attachment-annotations";
import { composePlayersCopy, fetchUploadedPicture } from "./annotation-render";
import { CATCH_UP_MS } from "./annotations";
import { isUploadedBlobUrl } from "./image-uploads";
import { publishPictureChanged } from "./realtime/publish-scene";

// The players' copy of an annotated picture: the picture with the
// storyteller's drawing over it at the players' fog, rendered on the server
// so the raw picture never reaches a player (docs/adr/0002). Each save of the
// drawing asks for a render; one render at a time holds the drawing's claim
// (db/attachment-annotations.ts) and keeps rendering until the copy has caught
// up with the drawing, so a storyteller drawing quickly has their players
// shown each stroke soon after it is made without a render per stroke.

const pathname = (idAttachment: number) => `annotations/${idAttachment}/players-copy.webp`;

function forget(url: string): Promise<void> {
  if (!isUploadedBlobUrl(url)) return Promise.resolve();
  return del(url).catch((error: unknown) =>
    console.error("Could not delete a players' copy", error),
  );
}

/**
 * Renders the picture's players' copy until it has caught up with the
 * drawing, uploading each and pointing the players at it. Does nothing when
 * the copy is current, the picture is not annotated, or another render holds
 * the drawing. Throws when the picture cannot be fetched or rendered, the
 * claim let go first so a later render may try again.
 */
export async function renderPlayersCopy(idStory: number, idAttachment: number): Promise<void> {
  const token = randomUUID();
  const started = Date.now();
  // The picture's bytes, fetched once for every render.
  let picture: Buffer | null = null;
  try {
    while (Date.now() - started < CATCH_UP_MS) {
      const job = await claimRender(idAttachment, token);
      if (!job) return;
      if (!picture) {
        if (!job.isUploaded || !job.pictureUrl) return;
        picture = await fetchUploadedPicture(job.pictureUrl);
      }
      const copy = await composePlayersCopy(picture, job);
      const blob = await put(pathname(idAttachment), copy, {
        access: "public",
        addRandomSuffix: true,
        contentType: "image/webp",
      });
      const result = await commitRender(idAttachment, token, {
        revision: job.revision,
        playerUrl: blob.url,
      });
      if (!result.committed) {
        await forget(blob.url);
        return;
      }
      await publishPictureChanged(idStory, idAttachment);
      // After the players have been pointed at the new copy, so none is left
      // showing an address that is already gone.
      if (result.previousUrl) await forget(result.previousUrl);
    }
  } finally {
    await releaseRender(idAttachment, token);
  }
}

/**
 * Renders the players' copy after the action's answer has gone out, as
 * publishLater publishes, the platform keeping the function alive until it
 * is done; outside a request it runs now. A failure is logged: the drawing is
 * saved either way, and the next save or the annotator's refresh renders it.
 */
export function renderPlayersCopyLater(idStory: number, idAttachment: number): void {
  const work = () =>
    renderPlayersCopy(idStory, idAttachment).catch((error: unknown) =>
      console.error("Could not render a players' copy", error),
    );
  try {
    after(work);
  } catch {
    void work();
  }
}
