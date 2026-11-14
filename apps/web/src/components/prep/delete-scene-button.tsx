"use client";

import { sa_deleteStoryScene } from "@/components/prep/actions";
import { DeleteButton } from "@/components/confirm/delete-button";

type Props = {
  idStoryScene: number;
  /** The scene's title, for the question and the toast. */
  title: string;
  /** The scene is in SCENE_LOCKED_STATUS: it has been played. */
  complete: boolean;
  /** The sitting it was played in, as the card names it; null when none. */
  sessionHeading: string | null;
  /** Called once the scene is gone, so the column can drop it. */
  onDeleted: () => void;
};

/**
 * The trash button on a scene card in the Prep Work board, and the dialog
 * that asks first (DeleteButton).
 *
 * Every scene asks, since deleting is not undoable and the button sits
 * beside Edit and Preview. A completed scene asks harder: it is part of the
 * record of a session that was played, so the dialog says which one and the
 * confirm reads "Delete anyway". It is still allowed; the storyteller owns
 * that record.
 */
export function DeleteSceneButton({
  idStoryScene,
  title,
  complete,
  sessionHeading,
  onDeleted,
}: Props) {
  return (
    <DeleteButton
      thing={title}
      label="Delete scene"
      confirmText={complete ? "Delete anyway" : "Delete"}
      warning={
        complete && (
          <>
            {sessionHeading
              ? `This scene has already been played, in ${sessionHeading}, and is part of that session's record.`
              : "This scene has already been played, and is part of a session's record."}{" "}
            Are you sure?
          </>
        )
      }
      onDelete={() => sa_deleteStoryScene(idStoryScene)}
      onDeleted={onDeleted}
      failed="The scene could not be deleted. Try again."
    >
      {title} will be removed from the story, along with the elements brought into it and their
      status there. The elements themselves stay, and so do its pictures, among the attachments.
      This cannot be undone.
    </DeleteButton>
  );
}
