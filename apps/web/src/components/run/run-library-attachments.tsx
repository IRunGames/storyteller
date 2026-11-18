"use client";

import { ArrowRight, Recycle, Trash2 } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import {
  attachmentLabel,
  RUN_LIST_SIZE,
  sortAttachments,
  type AttachmentSort,
  type PlayItem,
} from "@/lib/run";
import {
  sa_attachAsCover,
  sa_attachToHolder,
  sa_detachFromHolder,
} from "@/components/uploads/actions";
import { toaster } from "@/components/ui/toaster";
import { DeleteButton, type DeleteOutcome } from "@/components/confirm/delete-button";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import {
  AttachmentListField,
  type AttachmentRowsView,
} from "@/components/uploads/attachment-list-field";
import { AttachmentCoverButton } from "@/components/uploads/attachment-cover-button";
import { AttachmentTagsPopover } from "@/components/uploads/attachment-tags-popover";
import { useAttachmentSearch } from "@/components/uploads/use-attachment-search";
import { LibraryList } from "./run-library-list";

/** Whose attachments the Attachments tab lists: the story's own, or the scene's. */
type AttachmentsOf = "STORY" | "STORY_SCENE";

/**
 * What the Attachments tab's moves need: whose list this is, the scene the
 * table is on, the field's own setCover, and the table's ears. Handed to
 * each handler, which is a plain function rather than a closure in
 * renderRows.
 */
type MoveContext = {
  kind: AttachmentsOf;
  idExternal: number;
  idStoryScene: number | null;
  locked: boolean;
  setCover: AttachmentRowsView["setCover"];
  onSceneCoverChange: (url: string | null) => void;
  onMoved: () => void;
};

// Cover on a story picture while the table is on a scene makes it
// the scene's cover, not the story's; on the story's own cover the
// button only takes the cover away.
function movesToScene({ kind, idStoryScene, locked }: MoveContext, row: Attachment) {
  return kind === "STORY" && idStoryScene !== null && !locked && !row.isCover;
}

// Every way the cover is changed from here: the button, the tags
// popover and the full-size preview's.
async function changeCover(
  moves: MoveContext,
  row: Attachment,
  isCover: boolean,
): Promise<boolean> {
  const { kind, idStoryScene, setCover, onSceneCoverChange, onMoved } = moves;
  if (isCover && movesToScene(moves, row)) {
    try {
      const result = await sa_attachAsCover("STORY_SCENE", idStoryScene!, row.idAttachment);
      if (!result.ok) {
        toaster.create({ title: result.error, type: "error" });
        return false;
      }
      onSceneCoverChange(result.url);
      onMoved();
      toaster.create({ title: "Attached to the scene as its cover", type: "success" });
      return true;
    } catch {
      toaster.create({
        title: "The cover could not be changed. Try again.",
        type: "error",
      });
      return false;
    }
  }
  const ok = await setCover(row.idAttachment, isCover);
  if (ok && kind === "STORY_SCENE") onSceneCoverChange(isCover ? row.url : null);
  return ok;
}

// The arrow: onto the scene from the story's list. The story's list
// keeps the row.
async function attach({ idStoryScene, onMoved }: MoveContext, row: Attachment) {
  try {
    const result = await sa_attachToHolder("STORY_SCENE", idStoryScene!, [row.idAttachment]);
    if (!result.ok) {
      toaster.create({ title: result.error, type: "error" });
      return;
    }
    if (!result.attached.includes(row.idAttachment)) {
      toaster.create({ title: "That attachment is in the scene already.", type: "info" });
      return;
    }
    onMoved();
  } catch {
    toaster.create({
      title: "The attachment could not be changed. Try again.",
      type: "error",
    });
  }
}

// The Recycle: off the scene from the scene's list, once the question
// is answered. A refusal is the popover's to show, so it comes back
// as the outcome rather than as a toast.
async function detach(
  { idExternal, onSceneCoverChange, onMoved }: MoveContext,
  row: Attachment,
): Promise<DeleteOutcome> {
  const result = await sa_detachFromHolder("STORY_SCENE", idExternal, [row.idAttachment]);
  if (!result.ok) return result;
  if (!result.detached.includes(row.idAttachment)) {
    return { ok: false, error: "That attachment is not in the scene any more." };
  }
  // The scene's cover went with its use.
  if (row.isCover) onSceneCoverChange(null);
  onMoved();
  return { ok: true };
}

/**
 * The Attachments tab's list, for the story or for a scene: the board's
 * Attachments column made compact. It is AttachmentListField throughout,
 * drawn through its renderRows: the field loads the attachments, runs every
 * upload, applies the search (keeping one added since the search ran) and
 * holds the tags and the cover, and this lists its rows one to a line with
 * the card's own tags popover and Cover button beside each. So an attachment
 * added, tagged or made the cover here shows at once, as on its card. The
 * + opens the field's link input and dropzone; the field stays mounted with
 * the + closed, so an upload in flight carries on.
 *
 * The search narrows the rows by the ids it returns, as the column's does.
 * The rows are sorted here as the table's menu asks (sortAttachments),
 * before the first RUN_LIST_SIZE are taken, so the list is the first ten
 * of the holder's in that order rather than ten rows put in order.
 *
 * The story's own cover is left out of the story's list: it is the
 * picture on the story's card, not material for the table.
 *
 * An attachment's arrow in the story's list attaches it to the scene the
 * table is on (sa_attachToHolder), so the storyteller gives a scene what it
 * needs as it comes up. In the scene's list a Recycle in the arrow's place
 * takes it off again (sa_detachFromHolder), asking first since a scene's
 * cover goes with its use: a recycling rather than a trashcan, because the
 * file is the story's either way and stays in the story's list to be
 * attached again. With no scene at the table a story attachment has nowhere
 * to go and shows no arrow.
 *
 * At the table, a scene's cover is the picture behind the play space. So
 * while the table is on a scene, Cover on one of the story's attachments
 * does not make it the story's cover: it attaches it to the scene as the
 * scene's cover (sa_attachAsCover). Cover on the scene's attachments
 * is the plain toggle, and the play space follows it.
 */
export function RunAttachments({
  kind,
  idExternal,
  idStoryScene,
  locked,
  needle,
  sort,
  showAdd,
  onSceneCoverChange,
  onMoved,
}: {
  kind: AttachmentsOf;
  idExternal: number;
  idStoryScene: number | null;
  /** The scene is complete: no attachment moves into it or out of it. */
  locked: boolean;
  needle: string;
  sort: AttachmentSort;
  showAdd: boolean;
  onSceneCoverChange: (url: string | null) => void;
  onMoved: () => void;
}) {
  // A keystroke waits out the pause; a change of holder asks at once.
  const { shownIds: matchedIds } = useAttachmentSearch(kind, idExternal, needle, {
    atOnceOnHolderChange: true,
  });

  return (
    <AttachmentListField
      kind={kind}
      idExternal={idExternal}
      showAdd={showAdd}
      shownIds={matchedIds}
      hideCovers={kind === "STORY"}
      renderRows={({ rows, hasLoaded, setTags, setCover, remove }) => {
        const shown = sortAttachments(rows, sort).slice(0, RUN_LIST_SIZE);
        const byKey = new Map(shown.map((row) => [`ATTACHMENT:${row.idAttachment}`, row]));

        const moves: MoveContext = {
          kind,
          idExternal,
          idStoryScene,
          locked,
          setCover,
          onSceneCoverChange,
          onMoved,
        };

        return (
          <LibraryList
            items={hasLoaded ? shown.map(attachmentItem) : null}
            filtered={needle !== ""}
            renderArrow={(item) => {
              const row = byKey.get(item.key);
              // Only a finished attachment moves, and a story's only to a scene.
              if (!row || row.status !== "READY" || locked) return null;
              if (kind === "STORY" && idStoryScene === null) return null;
              return kind === "STORY" ? (
                <IconButtonWithTooltip
                  label={`Attach ${item.label} to the scene`}
                  onClick={() => void attach(moves, row)}
                >
                  <ArrowRight />
                </IconButtonWithTooltip>
              ) : (
                <DeleteButton
                  thing="this picture from the scene"
                  label={`Remove ${item.label} from the scene`}
                  verb="Remove"
                  icon={<Recycle />}
                  onDelete={() => detach(moves, row)}
                  done="Removed from the scene."
                  failed="The picture could not be removed from the scene. Try again."
                >
                  The picture leaves this scene and stays in the story&apos;s library, where it can
                  be attached again.
                  {row.isCover &&
                    " It is the cover, so the scene will have none until you choose another."}
                </DeleteButton>
              );
            }}
            editTagsFor={(item) => {
              const row = byKey.get(item.key);
              if (!row) return undefined;
              return {
                canCover: row.status === "READY",
                onTagsChange: (tags) => setTags(row.idAttachment, tags),
                onCoverChange: (isCover) => changeCover(moves, row, isCover),
              };
            }}
            renderActions={(item) => {
              const row = byKey.get(item.key);
              if (!row) return null;
              return (
                <>
                  <AttachmentTagsPopover
                    label={item.label}
                    tags={row.tags}
                    isCover={row.isCover}
                    canCover={row.status === "READY"}
                    onTagsChange={(tags) => setTags(row.idAttachment, tags)}
                    onCoverChange={(isCover) => changeCover(moves, row, isCover)}
                  />
                  {/* A failed upload holds no file and does nothing at the
                      table, so its one move is out of the list. No question
                      asked, unlike the card's trashcan: there is nothing in it to
                      lose. */}
                  {row.status === "ERROR" && (
                    <IconButtonWithTooltip
                      label={`Delete ${item.label}`}
                      onClick={() => void remove(row.idAttachment)}
                    >
                      <Trash2 />
                    </IconButtonWithTooltip>
                  )}
                  {row.status === "READY" && (
                    <AttachmentCoverButton
                      compact
                      label={item.label}
                      isCover={row.isCover}
                      onToggle={() => void changeCover(moves, row, !row.isCover)}
                      hint={
                        movesToScene(moves, row)
                          ? "Attach to the scene as the scene's cover"
                          : undefined
                      }
                    />
                  )}
                </>
              );
            }}
          />
        );
      }}
    />
  );
}

/**
 * One attachment as a library item. A row with no address yet says what is
 * happening to it in place of a picture, as its card does.
 */
function attachmentItem(row: Attachment): PlayItem {
  return {
    key: `ATTACHMENT:${row.idAttachment}`,
    kind: "ATTACHMENT",
    label: attachmentLabel(row),
    detail: row.url !== null ? null : row.status === "ERROR" ? "Upload failed" : "Uploading…",
    imageUrl: row.url,
    attachment: { tags: row.tags, isCover: row.isCover },
  };
}
