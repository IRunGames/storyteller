"use client";

import { DeleteButton } from "@/components/confirm/delete-button";

type Props = {
  /** What the attachment is called, to name the button per card. */
  label: string;
  /** A file we hold goes from storage as well; a typed link only loses its row. */
  isUploaded: boolean;
  isCover: boolean;
  onRemove: () => void;
};

/**
 * The card's trashcan button, and the popover that asks before it deletes
 * (DeleteButton). A removal cannot be taken back (the row goes, and an
 * upload's file goes from Blob with it), so one stray press must not be
 * enough. No toast: the list the card sits in shows the card gone.
 */
export function AttachmentRemoveButton({ label, isUploaded, isCover, onRemove }: Props) {
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
    </DeleteButton>
  );
}
