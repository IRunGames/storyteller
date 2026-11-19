"use client";

import { DeleteButton } from "@/components/confirm/delete-button";

type Props = {
  /** What the attachment is called, to name the button per card. */
  label: string;
  /** A file we hold goes from storage as well; a typed link only loses its row. */
  isUploaded: boolean;
  isCover: boolean;
  onRemove: () => void;
  /**
   * The picture is only taken off its holder, a scene or an element, named
   * here, and stays the story's (sa_detachFromHolder), so the question says
   * so rather than warning of a deletion that is not happening. Absent, the
   * row is deleted for good.
   */
  detachesFrom?: string;
  /** The file has a drawing over it, fog and pen marks, which goes with it: the question says so. */
  hasDrawing?: boolean;
};

/**
 * The card's trashcan button, and the popover that asks before it deletes
 * (DeleteButton). A removal cannot be taken back (the row goes, and an
 * upload's file goes from Blob with it), so one stray press must not be
 * enough; where the card only detaches the picture from a scene or an
 * element, the question says that instead. No toast: the list the card sits in shows the
 * card gone.
 */
export function AttachmentRemoveButton({
  label,
  isUploaded,
  isCover,
  onRemove,
  detachesFrom,
  hasDrawing = false,
}: Props) {
  if (detachesFrom) {
    return (
      <DeleteButton
        thing={`this picture from the ${detachesFrom}`}
        label={`Remove ${label}`}
        verb="Remove"
        onDelete={onRemove}
        done={null}
      >
        The picture leaves this {detachesFrom} and stays in the story&apos;s library, where it can
        be attached again.
        {isCover &&
          ` It is the cover, so the ${detachesFrom} will have none until you choose another.`}
      </DeleteButton>
    );
  }
  return (
    <DeleteButton
      thing="this attachment"
      label={`Remove ${label}`}
      verb="Remove"
      onDelete={onRemove}
      done={null}
    >
      {isUploaded
        ? "This permanently deletes the attachment and its uploaded file."
        : "This permanently deletes the attachment."}{" "}
      It cannot be undone.
      {isCover && " It is the cover, so there will be none until you choose another."}
      {hasDrawing && " The fog and pen marks drawn on it go with it."}
    </DeleteButton>
  );
}
