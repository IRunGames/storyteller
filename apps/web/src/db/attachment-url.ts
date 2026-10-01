import { sql, type SQLWrapper } from "drizzle-orm";

import { attachments } from "./schema";
import { COVER_TAG, type AttachmentKind } from "@/lib/attachments";

/**
 * The one picture a card or a popover shows for a row that may carry several:
 * the url of its attachment tagged COVER_TAG, and only that. An object with
 * attachments but no cover shows none, which is the storyteller's choice to
 * make with the Cover toggle, not something to guess at. Null when there is
 * no cover.
 *
 * It must also be READY: a cover is only ever set on a READY row, but an
 * UPLOADING row has no url and an ERROR one never will, so neither is a
 * picture to show however it came to be tagged.
 *
 * attachments_one_cover_idx allows one cover per object, so LIMIT 1 never
 * has to choose. @> rather than = ANY so the tags column's GIN index serves
 * it.
 *
 * A correlated scalar subquery rather than a join, for the reason favoritedBy
 * in stories/actions.ts gives: a second attachment must never duplicate or
 * drop the outer row, and a LIMIT/OFFSET page counts stories.
 *
 * It lives here rather than beside one of its callers because two route
 * groups need it — stories/actions.ts for the card, the story page and the
 * session popover, libraries/actions.ts for the scene panel — and a
 * "use server" module may only export server actions, so neither of them can
 * lend the other a helper.
 */
export function attachmentUrl(kind: AttachmentKind, idExternal: SQLWrapper) {
  return sql<string | null>`(
    select ${attachments.url}
    from ${attachments}
    where ${attachments.kind} = ${kind}
      and ${attachments.idExternal} = ${idExternal}
      and ${attachments.status} = 'READY'
      and ${attachments.tags} @> array[${COVER_TAG}]::text[]
    limit 1
  )`;
}
