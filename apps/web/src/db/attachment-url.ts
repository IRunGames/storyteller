import { sql } from "drizzle-orm";

import { vAttachmentUses } from "./schema";
import type { AttachmentKind } from "@/lib/attachments";

/**
 * The one picture a card, a popover, a panel or a pill shows for a holder
 * that may use several: the url of the attachment whose use by the holder
 * is tagged COVER_TAG, and only that. A holder with pictures but no cover
 * shows none, which is the storyteller's choice to make with the Cover
 * toggle, not something to guess at. Null when there is no cover.
 *
 * It must also be READY: a cover is only ever set on a READY row, but an
 * UPLOADING row has no url and an ERROR one never will, so neither is a
 * picture to show however it came to be tagged.
 *
 * attachment_uses_one_cover_idx allows one cover per holder, so LIMIT 1
 * never has to choose.
 *
 * A correlated scalar subquery rather than a join, for the reason favoritedBy
 * in stories/actions.ts gives: a second attachment must never duplicate or
 * drop the outer row, and a LIMIT/OFFSET page counts stories.
 *
 * The holder is named as the outer relation and its column, as identifiers,
 * rather than as a Drizzle column: Drizzle writes a single-table select's
 * columns unqualified, and an unqualified "id_story" inside this subquery
 * would be the view's own, which matches every row.
 *
 * It lives here rather than beside one of its callers because several route
 * groups need it, and a "use server" module may only export server actions,
 * so none of them can lend the others a helper.
 */
/**
 * The picture a pill shows for an element in a scene: the cover of the
 * element's link to the scene (its SCENE_ELEMENT use, how it looks there),
 * else the element's own picture (its ELEMENT use), else none. `linkSource`
 * is the outer relation holding id_scene_element and `elementSource` the
 * one holding id_element; a view that has both names the same relation
 * twice. With the link left-joined and absent, the first half is null and
 * the element's picture stands.
 */
export function sceneElementImageUrl(linkSource: string, elementSource: string) {
  return sql<string | null>`coalesce(${attachmentUrl(
    "SCENE_ELEMENT",
    linkSource,
    "id_scene_element",
  )}, ${attachmentUrl("ELEMENT", elementSource, "id_element")})`;
}

export function attachmentUrl(kind: AttachmentKind, source: string, column: string) {
  return sql<string | null>`(
    select ${vAttachmentUses.url}
    from ${vAttachmentUses}
    where ${vAttachmentUses.kind} = ${kind}
      and ${vAttachmentUses.idExternal} = ${sql.identifier(source)}.${sql.identifier(column)}
      and ${vAttachmentUses.status} = 'READY'
      and ${vAttachmentUses.isCover}
    limit 1
  )`;
}
