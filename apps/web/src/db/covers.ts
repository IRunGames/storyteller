import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { attachments, attachmentUses } from "./schema";
import { COVER_TAG, type AttachmentKind } from "@/lib/attachments";

/** Anything that can update, insert and delete: the pool, or a caller's transaction. */
type Executor = Pick<typeof db, "update" | "insert" | "delete">;

/**
 * tags @> '{cover}', the predicate attachment_uses_one_cover_idx is built
 * on, so the planner can match it to the index; = ANY would not.
 */
export const useIsCover = sql<boolean>`${attachmentUses.tags} @> array[${COVER_TAG}]::text[]`;

/**
 * The holders that show a file only as their cover, so a use of theirs with
 * no tags left means nothing and goes: a story's card shows its cover and
 * nothing else of its pool, which is every file it owns whether used or not.
 * A scene, a session, an element and a link keep their uses, which are their
 * lists of pictures, one of them the cover.
 */
function showsOnlyCover(kind: AttachmentKind): boolean {
  return kind === "STORY";
}

/** One holder's uses: a kind and the id of the row of that kind. */
export type Holder = { kind: AttachmentKind; idExternal: number };

function holderIs(holder: Holder) {
  return and(
    eq(attachmentUses.kind, holder.kind),
    eq(attachmentUses.idExternal, holder.idExternal),
  );
}

/**
 * Makes an attachment a holder's cover: the holder's use of the file tagged
 * COVER_TAG. The tag comes off whichever of the holder's uses held it first,
 * in the same transaction and before it is added, since
 * attachment_uses_one_cover_idx would refuse two at once; the use is made
 * on the spot when the holder had none, which is how a story or an element
 * comes to use a file from the story's pool. For a holder that shows a file
 * only as its cover, the use the tag came off goes too. Whether the file is
 * the story's and READY is the caller's to have checked: this is the write
 * four actions used to carry each in their own words.
 */
export async function setCover(
  holder: Holder,
  idAttachment: number,
  userId: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(attachmentUses)
    .set({ tags: sql`array_remove(${attachmentUses.tags}, ${COVER_TAG})`, idUpdatedByUser: userId })
    .where(
      and(holderIs(holder), useIsCover, sql`${attachmentUses.idAttachment} <> ${idAttachment}`),
    );
  if (showsOnlyCover(holder.kind)) await dropEmptyUses(holder, executor);
  await executor
    .insert(attachmentUses)
    .values({
      idAttachment,
      kind: holder.kind,
      idExternal: holder.idExternal,
      tags: [COVER_TAG],
      idCreatedByUser: userId,
      idUpdatedByUser: userId,
    })
    .onConflictDoUpdate({
      target: [attachmentUses.idAttachment, attachmentUses.kind, attachmentUses.idExternal],
      set: {
        tags: sql`case when ${useIsCover} then ${attachmentUses.tags} else array_append(${attachmentUses.tags}, ${COVER_TAG}) end`,
        idUpdatedByUser: userId,
      },
    });
}

/**
 * Takes a holder's cover away: the tag comes off the use that held it, of
 * one attachment or of whichever did, and the use stays, so the picture is
 * still among the holder's and can be made the cover again; except for a
 * holder that shows a file only as its cover, whose bare use goes. A holder
 * with no cover is left as it is.
 */
export async function clearCover(
  holder: Holder,
  userId: string,
  options: { idAttachment?: number } = {},
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(attachmentUses)
    .set({ tags: sql`array_remove(${attachmentUses.tags}, ${COVER_TAG})`, idUpdatedByUser: userId })
    .where(
      and(
        holderIs(holder),
        useIsCover,
        options.idAttachment === undefined
          ? undefined
          : eq(attachmentUses.idAttachment, options.idAttachment),
      ),
    );
  if (showsOnlyCover(holder.kind)) await dropEmptyUses(holder, executor);
}

/** A use of the holder's with no tags left says nothing and goes; the file stays the story's. */
async function dropEmptyUses(holder: Holder, executor: Executor): Promise<void> {
  await executor
    .delete(attachmentUses)
    .where(and(holderIs(holder), sql`${attachmentUses.tags} = '{}'::text[]`));
}

/**
 * The address of one of the story's finished attachments, or null when it
 * is not one: id_story on attachments is the story that owns the file,
 * whichever of its parts use it, so this covers the story's pool whole. What
 * a holder's cover is chosen from.
 */
export async function storyPictureUrl(
  idStory: number,
  idAttachment: number,
): Promise<string | null> {
  const [row] = await db
    .select({ url: attachments.url })
    .from(attachments)
    .where(
      and(
        eq(attachments.idAttachment, idAttachment),
        eq(attachments.idStory, idStory),
        eq(attachments.status, "READY"),
      ),
    )
    .limit(1);
  return row?.url ?? null;
}
