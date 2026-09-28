import { sql, type SQLWrapper } from "drizzle-orm";

import { attachments } from "./schema";
import type { AttachmentKind } from "@/lib/attachments";

/**
 * The one picture a card or a popover shows for a row that may now carry
 * several: the url of its first READY attachment, in the order
 * sa_listAttachments lists them — sort_order, then id_attachment — so a story
 * with three covers always shows the same one rather than whichever the
 * planner happened to reach first. Null when there is none, which is what the
 * dropped image column held for a story with no picture.
 *
 * READY is the whole filter on status: an UPLOADING row has no url yet and an
 * ERROR one never will, so neither is a picture to show.
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
    order by ${attachments.sortOrder}, ${attachments.idAttachment}
    limit 1
  )`;
}
