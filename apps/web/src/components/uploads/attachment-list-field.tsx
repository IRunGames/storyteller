"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Box, Button, Field, Grid, HStack, Text } from "@chakra-ui/react";
import { ChevronsRight } from "lucide-react";
import { attachmentUrlSchema } from "@/lib/attachment-schemas";
import {
  sa_createAttachment,
  sa_deleteAttachment,
  sa_setAttachmentCover,
  sa_setAttachmentTags,
} from "./actions";
import { AttachmentAddControls } from "./attachment-add-controls";
import { AttachmentCard } from "./attachment-card";
import { UNKNOWN_STATUS, useAttachmentRows } from "./use-attachment-rows";
import { justNow, useAttachmentUploads } from "./use-attachment-uploads";
import type { PictureState } from "@/lib/annotations";
import type { Attachment, AttachmentKind } from "@/lib/attachments";

type Props = {
  kind: AttachmentKind;
  /** Null on a create form, before the parent row exists. */
  idExternal: number | null;
  /**
   * The attachment ids the form will claim, in display order.
   *
   * Read only once, as the initial state, and only when idExternal is null:
   * a create form that remounts (e.g. after a failed submit that reset the
   * tree) has no sa_listAttachments to recover its rows from, since nothing
   * with a null idExternal is findable that way -- `value`, coming from the
   * form's own state, is the only surviving record. Those ids render with
   * UNKNOWN_STATUS (use-attachment-rows.ts) rather than an invented READY.
   *
   * When idExternal is non-null this field ignores `value` completely and
   * hydrates its rows -- with their real statuses -- from
   * sa_listAttachments instead, which is authoritative where `value` is not
   * (a status this field never recorded is not something `value` could ever
   * carry, since it is just ids).
   */
  value?: number[];
  /**
   * Told the ids whenever the set or its order changes. Optional because a
   * field with a real idExternal attaches its rows itself and has nothing a
   * parent must collect: the story page mounts it that way from a server
   * component, which cannot hand a function to a client one.
   */
  onChange?: (ids: number[]) => void;
  /**
   * Whether the link input and the dropzone show. Defaults to shown; the story
   * page keeps them behind its Add Attachments toggle so the cards are what
   * the section opens on. Hiding them unmounts nothing that matters: uploads
   * in flight, the typed link and zag's FileUpload machine all live in this
   * component, which stays mounted either way.
   */
  showAdd?: boolean;
  /** An id for the block holding the link input and dropzone, for aria-controls. */
  addId?: string;
  /**
   * Somewhere else on the page to draw the link input and dropzone, when the
   * page wants them away from the cards: the Prep Work board puts them above
   * its column's filters. Drawn there through a portal, so they are still
   * this component's own, with the rows, the typed link and any upload in
   * flight. Undefined draws them in place; null means the page's box is not
   * there yet, and nothing is drawn until it is.
   */
  addTarget?: HTMLElement | null;
  /**
   * Only these attachments show, when given: the ids a search matched, from
   * sa_searchAttachments. The field still holds every row, so narrowing it
   * is a matter of what is drawn, and clearing the search brings the rest
   * straight back. Null or absent shows them all.
   */
  shownIds?: ReadonlySet<number> | null;
  /** Leaves the cover out of the cards, for the Prep Work board's Covers switch. */
  hideCovers?: boolean;
  /**
   * Says so in words when there is nothing to show, once the rows have
   * loaded: "No attachments yet" for an object with none, "No matches" when
   * the search or the Covers switch leaves none. The story page goes without,
   * since its heading and toggle already say what the section is for.
   */
  showEmpty?: boolean;
  /**
   * Told how many attachments the field holds, once the first load is back
   * and whenever an add or a delete changes it: the Prep Work board's count
   * beside the Attachments heading. Every row counts, whatever the search or
   * the Covers switch leaves drawn, as the Scenes count ignores its search.
   */
  onCountChange?: (count: number) => void;
  /**
   * Draws the rows in place of the cards, for a page that lists attachments
   * its own way and keeps this field for everything else: loading, adding,
   * uploading, the search and the Covers switch. Handed what would have been
   * drawn (the search and the Covers switch already applied, newest first)
   * and this field's own optimistic handlers, so a tag or cover changed there
   * changes here too. The run page's library is the one that does.
   */
  renderRows?: (view: AttachmentRowsView) => ReactNode;
  /**
   * Draw this many cards at first, with a More button under them for as
   * many again, rather than every one: the Prep Work board's column, where a
   * story's attachments run long and each card fetches its picture. Every
   * row is still loaded, so the search, the Covers switch and the count
   * work over all of them; only what is drawn is cut. A new search or a
   * flip of the switch starts again from the first page. Left out, every
   * card is drawn.
   */
  pageSize?: number;
  /**
   * Each finished picture the app uploaded offers its annotation controls
   * (AnnotationControls): the story's Attachments, and an element's pictures.
   */
  canAnnotate?: boolean;
};

/** A row's drawing and how it is shown, as the annotation controls read a picture back. */
export function pictureRow(
  picture: PictureState,
): Pick<Attachment, "drawing" | "shownUrl" | "fogCovered" | "fogActive"> {
  return {
    drawing: picture.hasDrawing ? { isActive: picture.isAnnotated } : null,
    shownUrl: picture.shownUrl,
    fogCovered: picture.fogCovered,
    fogActive: picture.fogActive,
  };
}

/** What a renderRows caller is given; see Props.renderRows. */
export type AttachmentRowsView = {
  rows: Attachment[];
  /** Whether the first load is back, so an empty list can say none. */
  hasLoaded: boolean;
  /** As the card's tags popover calls it; resolves false on a refusal. */
  setTags: (idAttachment: number, tags: string[]) => Promise<boolean>;
  /** As the card's Cover button calls it; resolves false on a refusal. */
  setCover: (idAttachment: number, isCover: boolean) => Promise<boolean>;
  /**
   * As the card's trashcan calls it: the row goes at once and comes back, with
   * the field's error, if the delete is refused.
   */
  remove: (idAttachment: number) => Promise<void>;
  /** As the card's Retry calls it, for an upload that failed. */
  retry: (idAttachment: number) => void;
  /** As the card's annotation controls report it: the row's drawing on, or off. */
  setAnnotated: (idAttachment: number, annotated: boolean) => void;
  /** As the card's annotation controls read it back: the row's drawing and how it is shown. */
  setPicture: (picture: PictureState) => void;
};

/**
 * A controlled list of attachment ids for a story, session or scene. Unlike
 * ImageUploadField's single value, each row is its own attachment row from
 * the moment a link is typed or a file is picked, so kind/idExternal are
 * handed to sa_createAttachment straight away -- an edit form's rows are
 * already attached to their parent at creation, and a create form's rows
 * simply carry a null idExternal until Task 9's create action claims them.
 * This field never calls sa_claimAttachments itself.
 *
 * The rows and how they are kept are useAttachmentRows; the dropzone and
 * each file's upload and retry are useAttachmentUploads; the link input and
 * the dropzone are AttachmentAddControls. What is left here is the field's
 * own changes to a row (its cover, its tags, its removal), a typed link,
 * and what is drawn of the rows.
 */
export function AttachmentListField({
  kind,
  idExternal,
  value = [],
  onChange,
  showAdd = true,
  addId,
  addTarget,
  shownIds = null,
  hideCovers = false,
  showEmpty = false,
  onCountChange,
  renderRows,
  pageSize,
  canAnnotate = false,
}: Props) {
  const router = useRouter();
  const attachmentRows = useAttachmentRows({ kind, idExternal, value, onChange, onCountChange });
  // The refs stay on attachmentRows rather than being taken off it: the
  // handlers below read them, and the hooks lint takes a bare ref captured
  // by a function handed to renderRows for one read during render.
  const { rows, commit, addRow, updateRow, loadError, hasLoaded, isLoading, loadAttachments } =
    attachmentRows;
  const [urlValue, setUrlValue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const uploads = useAttachmentUploads({ kind, idExternal, rows: attachmentRows, setFieldError });

  async function handleAddUrl() {
    const url = urlValue.trim();
    if (!url) return;
    // Checked client-side against the same schema sa_createAttachment runs
    // server-side, rather than letting a bad url reach the network and
    // relying on the thrown error's message surviving the server action
    // boundary intact. attachmentUrlSchema's own message is the one
    // surfaced, so there is exactly one wording for "not a valid url" to
    // keep in sync, not two that can drift apart.
    const parsed = attachmentUrlSchema.safeParse(url);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Please enter a valid URL.");
      return;
    }
    setFieldError(null);
    try {
      const created = await sa_createAttachment({ kind, idExternal, url: parsed.data });
      addRow({
        idAttachment: created.idAttachment,
        idStory: null,
        kind,
        idExternal,
        idAttachmentUse: null,
        status: created.status,
        url: parsed.data,
        isUploaded: false,
        fileName: null,
        isCover: false,
        tags: [],
        ...justNow(),
      });
      setUrlValue("");
    } catch {
      // Genuinely unexpected at this point -- the url was already checked
      // above -- so this is a network or server failure
      // rather than something the message could name more specifically.
      setFieldError("That link could not be added. Please try again.");
    }
  }

  /**
   * Makes a row the cover, or stops it being one. Shown at once: the row
   * pressed takes the cover and every other row loses it, matching what
   * sa_setAttachmentCover does in one transaction, and the old flags go back
   * if the action refuses. On success the page around the field re-renders,
   * since the cover it draws (the story page's backdrop) is server-rendered.
   * Resolves false on a refusal, for the card or popover to say so beside
   * the control that was pressed.
   */
  async function handleCover(id: number, isCover: boolean): Promise<boolean> {
    const before = attachmentRows.rowsRef.current;
    commit(
      before.map((row) => ({
        ...row,
        isCover: row.idAttachment === id ? isCover : isCover ? false : row.isCover,
      })),
    );
    try {
      // Only reachable with rows loaded for a holder, so idExternal is set.
      await sa_setAttachmentCover(kind, idExternal as number, id, isCover);
      router.refresh();
      return true;
    } catch {
      // Back to the flags as they were for every row this press touched,
      // matched by id because rows may have been added or removed meanwhile.
      const previous = new Map(before.map((row) => [row.idAttachment, row.isCover]));
      commit(
        attachmentRows.rowsRef.current.map((row) => ({
          ...row,
          isCover: previous.get(row.idAttachment) ?? row.isCover,
        })),
      );
      return false;
    }
  }

  /**
   * Replaces a row's tags, shown at once and put back if the action refuses.
   * Resolves false on a refusal, which the tags popover reports itself. No
   * refresh: nothing outside this field shows a plain tag.
   */
  async function handleTags(id: number, tags: string[]): Promise<boolean> {
    const previous = attachmentRows.rowsRef.current.find((row) => row.idAttachment === id)?.tags;
    if (!previous) return false;
    updateRow(id, { tags });
    try {
      await sa_setAttachmentTags(id, tags);
      return true;
    } catch {
      updateRow(id, { tags: previous });
      return false;
    }
  }

  async function handleRemove(id: number) {
    // Everything undone below is captured first, because a refused delete
    // has to put the row back exactly where it was: the row itself and its
    // position, and (useAttachmentUploads.forget) the cached file Retry
    // would resend and the in-flight attempt's ticket.
    const index = attachmentRows.rowsRef.current.findIndex((row) => row.idAttachment === id);
    if (index === -1) return;
    const removedRow = attachmentRows.rowsRef.current[index];

    // Recorded before anything else: a list fetch's SELECT can land between
    // this function's synchronous commit() below and the sa_deleteAttachment
    // it then awaits, and would otherwise still see -- and bring back -- a
    // row this call is in the middle of removing.
    attachmentRows.removedIds.current.add(id);
    const carried = uploads.forget(id);
    commit(attachmentRows.rowsRef.current.filter((row) => row.idAttachment !== id));
    try {
      // The popover said the file's drawing goes with it, so pressing Remove
      // confirmed it; one drawn since the list loaded was not mentioned, and
      // the server refuses it, which puts the row back below.
      if (removedRow.drawing) {
        await sa_deleteAttachment(id, { dropDrawing: true });
      } else {
        await sa_deleteAttachment(id);
      }
      // The cover is drawn by the server-rendered page around this field (the
      // story page's backdrop), which knows nothing of this list. Removing it
      // leaves that page showing a picture that is gone until it re-renders.
      if (removedRow.isCover) router.refresh();
    } catch {
      // The row went off screen synchronously above and the parent has
      // already been told it left, so a refusal that only logged itself
      // would leave the user believing an attachment is gone that is still
      // attached -- and, on a story, still its cover. Everything the removal
      // did is undone and the failure is named inline, next to the field
      // rather than in a toast, because it is a failure the user has to act
      // on.
      attachmentRows.removedIds.current.delete(id);
      uploads.restore(id, carried);
      if (!attachmentRows.rowsRef.current.some((row) => row.idAttachment === id)) {
        const restored = [...attachmentRows.rowsRef.current];
        restored.splice(Math.min(index, restored.length), 0, removedRow);
        commit(restored);
      }
      setFieldError("That attachment could not be removed. Please try again.");
    }
  }

  // The link input and dropzone, drawn below where the field starts or into
  // addTarget.
  const addControls = (
    <AttachmentAddControls
      id={addId}
      fileUpload={uploads.fileUpload}
      urlValue={urlValue}
      onUrlChange={setUrlValue}
      onAddLink={() => void handleAddUrl()}
    />
  );

  // What is drawn: every row, less any a search left out and, when the
  // Covers pill is off, the cover. Filtering what is drawn rather than rows
  // itself keeps the ids reported through onChange the whole set. A row
  // added here always shows: the search that would decide it ran before it
  // existed, and a picture vanishing as it is added would look like a failure.
  const visibleRows = rows.filter(
    (row) =>
      (shownIds === null ||
        shownIds.has(row.idAttachment) ||
        attachmentRows.addedHere.current.has(row.idAttachment)) &&
      !(hideCovers && row.isCover),
  );
  // How many of those are drawn, when the page asked for pages: back to the
  // first whenever the search or the Covers switch changes what is drawn.
  // Kept beside what it was counted for, and reset while rendering, as
  // React has state follow a prop that changed.
  const pageFor = `${shownIds === null ? "" : [...shownIds].join(",")}|${hideCovers}`;
  const [paging, setPaging] = useState({ for: pageFor, count: pageSize ?? 0 });
  if (pageSize !== undefined && paging.for !== pageFor) {
    setPaging({ for: pageFor, count: pageSize });
  }
  const drawnRows = pageSize === undefined ? visibleRows : visibleRows.slice(0, paging.count);

  return (
    <Field.Root invalid={!!fieldError || !!loadError} w="full" gap="3">
      {/* No caption for the whole field: the page around it supplies the
          heading, as the story page's Attachments section does. This
          Field.Root holds two controls (the link input and the dropzone's
          hidden file input) and a label binds to one, so the link gets a
          Field.Root of its own for its "Link" label; the outer one stays for
          the field-wide error state and its ErrorText. */}
      {/* In place, or in the box the page asked for; see addTarget. */}
      {showAdd &&
        (addTarget === undefined
          ? addControls
          : addTarget !== null && createPortal(addControls, addTarget))}

      {loadError && (
        <HStack>
          <Field.ErrorText>{loadError}</Field.ErrorText>
          <Button
            size="xs"
            type="button"
            aria-disabled={isLoading}
            onClick={() => void loadAttachments()}
          >
            Try again
          </Button>
        </HStack>
      )}

      {renderRows ? (
        renderRows({
          rows: visibleRows,
          hasLoaded,
          setTags: handleTags,
          setCover: handleCover,
          remove: handleRemove,
          retry: (idAttachment) => void uploads.retry(idAttachment),
          setAnnotated: (idAttachment, annotated) =>
            updateRow(idAttachment, { drawing: { isActive: annotated } }),
          setPicture: (picture) => updateRow(picture.idAttachment, pictureRow(picture)),
        })
      ) : (
        <>
          {showEmpty && hasLoaded && !loadError && visibleRows.length === 0 && (
            <Text color="fg.muted">
              {rows.length === 0 ? "No attachments yet." : "No matches."}
            </Text>
          )}

          {/* auto-fill, so the cards fill the row and wrap to as many columns
              as the width holds, down to one on a phone. */}
          <Grid
            role="list"
            aria-label="Current attachments"
            w="full"
            gap="3"
            templateColumns="repeat(auto-fill, minmax(13rem, 1fr))"
          >
            {drawnRows.map((row) => (
              <AttachmentCard
                key={row.idAttachment}
                row={row}
                label={row.fileName ?? row.url ?? `Attachment ${row.idAttachment}`}
                placeholder={
                  row.status === "ERROR"
                    ? "Failed"
                    : row.status === UNKNOWN_STATUS
                      ? "Attachment"
                      : "Uploading…"
                }
                canTag={idExternal !== null}
                onRetry={() => void uploads.retry(row.idAttachment)}
                onRemove={() => void handleRemove(row.idAttachment)}
                onCoverChange={(isCover) => handleCover(row.idAttachment, isCover)}
                onTagsChange={(tags) => handleTags(row.idAttachment, tags)}
                onAnnotatedChange={
                  canAnnotate
                    ? (annotated) =>
                        updateRow(row.idAttachment, { drawing: { isActive: annotated } })
                    : undefined
                }
                onPictureChange={(picture) => updateRow(row.idAttachment, pictureRow(picture))}
              />
            ))}
          </Grid>

          {/* The same More the board's other columns end with. */}
          {pageSize !== undefined && drawnRows.length < visibleRows.length && (
            <Box>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setPaging((current) => ({ ...current, count: current.count + pageSize }))
                }
              >
                More
                <ChevronsRight />
              </Button>
            </Box>
          )}
        </>
      )}

      <Field.ErrorText>{fieldError}</Field.ErrorText>
    </Field.Root>
  );
}
