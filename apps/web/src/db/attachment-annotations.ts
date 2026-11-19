import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { attachmentAnnotations } from "./schema";
import type { AnnotationOp } from "@/lib/annotation-schemas";
import { RENDER_CLAIM_SECONDS } from "@/lib/annotations";

// The reads and writes of attachment_annotations that more than one module
// makes: the annotation actions, the attachment actions that delete a file
// with its drawing, and the players' copy render (lib/players-copy.ts),
// whose claim and commit are below.

/** Anything that can select: the pool, or a caller's transaction. */
type Executor = Pick<typeof db, "select">;

export type AnnotationRow = typeof attachmentAnnotations.$inferSelect;

/** A picture's drawing, on or off, or null when it has none. */
export async function annotationOf(
  idAttachment: number,
  executor: Executor = db,
): Promise<AnnotationRow | null> {
  const [row] = await executor
    .select()
    .from(attachmentAnnotations)
    .where(eq(attachmentAnnotations.idAttachment, idAttachment))
    .limit(1);
  return row ?? null;
}

/** What a render works from: the drawing as it stands, and the picture it is drawn on. */
export type RenderJob = {
  pictureUrl: string | null;
  isUploaded: boolean;
  width: number;
  height: number;
  ops: AnnotationOp[];
  revision: number;
  fogOpacityPlayers: number;
  fogColor: string;
};

/**
 * Claims the picture's drawing for a render under `token`, or lets it go.
 *
 * The row is claimed when no render holds it, when this one already does, or
 * when the one that does has held it past RENDER_CLAIM_SECONDS. Claimed, it
 * keeps the claim if the players' copy is behind the drawing (an annotated
 * picture whose copy was rendered from an older save, or never) and the job
 * comes back; otherwise the claim is let go in the same statement and null
 * comes back. Deciding and letting go at once is what keeps a save from
 * going unrendered: a save landing just before this statement makes the copy
 * behind, so this render takes it on; one landing after finds the claim free
 * and its own render takes it.
 *
 * Null, too, when another render holds a live claim: it will see the drawing
 * as it stands when it next claims.
 */
export async function claimRender(idAttachment: number, token: string): Promise<RenderJob | null> {
  const { rows } = await db.execute<RenderJob & { behind: boolean }>(sql`
    with claimed as (
      update attachment_annotations aa
      set render_token = case when aa.is_active and aa.player_revision is distinct from aa.revision
                              then ${token}::uuid end,
          render_claimed_at = case when aa.is_active and aa.player_revision is distinct from aa.revision
                                   then now() end
      where aa.id_attachment = ${idAttachment}
        and (aa.render_token is null
             or aa.render_token = ${token}::uuid
             or aa.render_claimed_at < now() - make_interval(secs => ${RENDER_CLAIM_SECONDS}))
      returning aa.id_attachment, aa.width, aa.height, aa.ops, aa.revision, aa.fog_opacity_players,
                aa.fog_color, aa.render_token is not null as behind
    )
    select a.url as "pictureUrl", a.is_uploaded as "isUploaded",
           c.width, c.height, c.ops, c.revision, c.fog_opacity_players as "fogOpacityPlayers",
           c.fog_color as "fogColor", c.behind
    from claimed c
    join attachments a on a.id_attachment = c.id_attachment
  `);
  const [row] = rows;
  if (!row || !row.behind) return null;
  const { behind: _behind, ...job } = row;
  return job;
}

/**
 * Points the players at a rendered copy, if the render still may: it holds
 * the claim (a drawing deleted meanwhile, its file with it, is not this
 * render's to finish). Returns whether it did, and the copy it replaced, for
 * the caller to delete from Blob; when it did not, the new copy is the
 * caller's to delete instead.
 */
export async function commitRender(
  idAttachment: number,
  token: string,
  rendered: { revision: number; playerUrl: string },
): Promise<{ committed: boolean; previousUrl: string | null }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        renderToken: attachmentAnnotations.renderToken,
        playerUrl: attachmentAnnotations.playerUrl,
      })
      .from(attachmentAnnotations)
      .where(eq(attachmentAnnotations.idAttachment, idAttachment))
      .for("update");
    if (!row || row.renderToken !== token) return { committed: false, previousUrl: null };
    await tx
      .update(attachmentAnnotations)
      .set({ playerUrl: rendered.playerUrl, playerRevision: rendered.revision })
      .where(eq(attachmentAnnotations.idAttachment, idAttachment));
    return { committed: true, previousUrl: row.playerUrl };
  });
}

/** Lets a render's claim go, if it still holds it: a render that failed, so the next may try. */
export async function releaseRender(idAttachment: number, token: string): Promise<void> {
  await db
    .update(attachmentAnnotations)
    .set({ renderToken: null, renderClaimedAt: null })
    .where(
      and(
        eq(attachmentAnnotations.idAttachment, idAttachment),
        eq(attachmentAnnotations.renderToken, token),
      ),
    );
}
