"use client";

import { sa_deleteStorySession } from "@/app/(app)/(nav)/stories/actions";
import { DeleteButton } from "@/components/confirm/delete-button";

type Props = {
  idStorySession: number;
  /** "3. Kildealg", to name the button per row and the question. */
  heading: string;
  /** The session is gone, so the row can go too. */
  onDeleted: () => void;
};

/**
 * A Timeline row's trashcan, and the popover that asks before it deletes
 * (DeleteButton): the session cannot be brought back. The question says
 * what goes with it, since a finished session can be deleted too and may
 * carry a sitting's worth of history: its scenes stay in the story but lose
 * their link to it, and the record of who came to it goes.
 */
export function DeleteSessionButton({ idStorySession, heading, onDeleted }: Props) {
  return (
    <DeleteButton
      thing={heading}
      label={`Delete ${heading}`}
      onDelete={() => sa_deleteStorySession(idStorySession)}
      onDeleted={onDeleted}
      done="Session deleted"
      failed="The session could not be deleted. Try again."
    >
      This permanently deletes the session and the record of who came to it. Its scenes stay in the
      story, but each loses its link to this session. It cannot be undone.
    </DeleteButton>
  );
}
