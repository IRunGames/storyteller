import { sql, type SQL } from "drizzle-orm";

import { vAttachmentUses } from "./schema";
import type { PictureState } from "@/lib/annotations";
import type { AttachmentKind } from "@/lib/attachments";

/**
 * The file a pill shows for an element in a scene, as sceneElementImageUrl
 * picks it (the link's cover, else the element's), as a subquery of one row
 * (id_attachment, url, is_uploaded) or none, for the reads below to look up its drawing.
 * Every column is named through an alias of its own, not as a Drizzle
 * column: Drizzle writes a single-table select's columns bare, and a bare
 * id_element in a subquery would be the subquery's own.
 */
function pillPicture(linkSource: string, elementSource: string) {
  const idElement = sql`${sql.identifier(elementSource)}.${sql.identifier("id_element")}`;
  const idSceneElement = sql`${sql.identifier(linkSource)}.${sql.identifier("id_scene_element")}`;
  return sql`(
    select vu.id_attachment, vu.url, vu.is_uploaded
    from v_attachment_uses vu
    where vu.status = 'READY'
      and vu.is_cover
      and ((vu.kind = 'SCENE_ELEMENT' and vu.external_id = ${idSceneElement})
        or (vu.kind = 'ELEMENT' and vu.external_id = ${idElement}))
    order by vu.kind = 'SCENE_ELEMENT' desc
    limit 1
  )`;
}

// What the storyteller is shown of a file `f` with its drawing `aa`
// left-joined: the players' copy while it is annotated and one has been
// rendered, so their pills and previews show what the players see, else the
// file itself. Never for a player: their reads go through
// playerSceneElementImageUrl, which never falls back to the file.
const shownUrl = sql`case when aa.is_active and aa.player_url is not null
  then aa.player_url else f.url end`;

/**
 * The picture the storyteller's pill shows for an element in a scene: the
 * cover of the element's link to the scene (its SCENE_ELEMENT use, how it
 * looks there), else the element's own picture (its ELEMENT use), else none;
 * as the players see it while it is annotated and its copy is rendered.
 * `linkSource` is the outer relation holding id_scene_element and
 * `elementSource` the one holding id_element; a view that has both names the
 * same relation twice. With the link left-joined and absent, the element's
 * picture stands.
 */
export function sceneElementImageUrl(linkSource: string, elementSource: string) {
  return sql<string | null>`(
    select ${shownUrl}
    from ${pillPicture(linkSource, elementSource)} f
    left join attachment_annotations aa on aa.id_attachment = f.id_attachment
  )`;
}

/**
 * The picture a player is given for an element in a scene: the players'
 * read model of sceneElementImageUrl. The same file, except where it is
 * annotated (attachment_annotations.is_active): then the players are given
 * the players' copy, the picture with the storyteller's drawing over it at
 * the players' fog, and never the raw picture (docs/adr/0002). Null while
 * the first copy is still being rendered: nothing is shown rather than the
 * raw picture.
 *
 * The drawing is the file's, so an element shows it wherever the file is
 * the picture its pill shows: its own picture in every scene, or its link's
 * in one. The same file used anywhere else (as a scene's or the story's
 * cover, or among a link's other pictures) is that holder's, shown as it is.
 */
export function playerSceneElementImageUrl(linkSource: string, elementSource: string) {
  return sql<string | null>`(
    select case when aa.is_active then aa.player_url else p.url end
    from ${pillPicture(linkSource, elementSource)} p
    left join attachment_annotations aa on aa.id_attachment = p.id_attachment
  )`;
}

/**
 * Whether the picture the storyteller's pill shows for an element in a
 * scene is annotated. The pill then opens the annotator rather than the
 * plain picture, and is marked as fogged.
 */
export function annotatedForStoryteller(linkSource: string, elementSource: string) {
  return sql<boolean>`exists (
    select 1
    from ${pillPicture(linkSource, elementSource)} p
    join attachment_annotations aa on aa.id_attachment = p.id_attachment and aa.is_active
  )`;
}

/** The element's own finished cover, as the subquery the element reads below look it up from. */
function elementCover(elementSource: string) {
  return sql`(
    select vu.id_attachment, vu.url, vu.is_uploaded
    from v_attachment_uses vu
    where vu.kind = 'ELEMENT'
      and vu.external_id = ${sql.identifier(elementSource)}.${sql.identifier("id_element")}
      and vu.status = 'READY'
      and vu.is_cover
    limit 1
  )`;
}

/**
 * Whether the element's own picture is annotated, for a pill made before it
 * has a link of its own to look at: a new link shows the element's cover, so
 * it is annotated exactly when that picture is.
 */
export function elementAnnotated(elementSource: string) {
  return sql<boolean>`exists (
    select 1
    from ${elementCover(elementSource)} c
    join attachment_annotations aa on aa.id_attachment = c.id_attachment and aa.is_active
  )`;
}

/**
 * The PictureState of the file a one-row subquery of (id_attachment, url,
 * is_uploaded) names, as json, or null when it names none: what a picture's
 * annotation controls are drawn from.
 */
function pictureStateOf(file: SQL) {
  return sql<PictureState | null>`(
    select json_build_object(
      'idAttachment', f.id_attachment,
      'shownUrl', ${shownUrl},
      'canAnnotate', f.is_uploaded,
      'hasDrawing', aa.id_attachment is not null,
      'isAnnotated', coalesce(aa.is_active, false))
    from ${file} f
    left join attachment_annotations aa on aa.id_attachment = f.id_attachment
  )`;
}

/** The element's own picture as its annotation controls need it, or null when it has none. */
export function elementPicture(elementSource: string) {
  return pictureStateOf(elementCover(elementSource));
}

/** The element's own picture as the storyteller is shown it (shownUrl), or null for none. */
export function elementPictureUrl(elementSource: string) {
  return sql<string | null>`(
    select ${shownUrl}
    from ${elementCover(elementSource)} f
    left join attachment_annotations aa on aa.id_attachment = f.id_attachment
  )`;
}

/** How many finished pictures the element holds besides its cover. */
export function elementOtherPictures(elementSource: string) {
  return sql<number>`(
    select count(*)::int
    from v_attachment_uses vu
    where vu.kind = 'ELEMENT'
      and vu.external_id = ${sql.identifier(elementSource)}.${sql.identifier("id_element")}
      and vu.status = 'READY'
      and not vu.is_cover
  )`;
}

/** The picture a pill shows for an element in a scene, as its annotation controls need it. */
export function scenePicture(linkSource: string, elementSource: string) {
  return pictureStateOf(pillPicture(linkSource, elementSource));
}

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

/**
 * The holder's cover, else the first of its pictures in the storyteller's
 * order (sort_order, then the use's id), else null: for the storyboard's
 * scene cards, where a scene with pictures but no cover still shows one
 * rather than a grey box. Everywhere else attachmentUrl is the rule, for the
 * reason it gives; this is the one deliberate exception, and
 * lib/storyboard.ts says why. READY only, as there: a row still uploading
 * or failed has no picture to show. The cover first, so the storyteller's
 * choice stands when they have made one.
 */
export function attachmentOrFirstUrl(kind: AttachmentKind, source: string, column: string) {
  return sql<string | null>`(
    select ${vAttachmentUses.url}
    from ${vAttachmentUses}
    where ${vAttachmentUses.kind} = ${kind}
      and ${vAttachmentUses.idExternal} = ${sql.identifier(source)}.${sql.identifier(column)}
      and ${vAttachmentUses.status} = 'READY'
    order by ${vAttachmentUses.isCover} desc, ${vAttachmentUses.sortOrder} asc, ${vAttachmentUses.idAttachmentUse} asc
    limit 1
  )`;
}
