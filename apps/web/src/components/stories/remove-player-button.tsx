"use client";

import { UserMinus } from "lucide-react";
import type { StoryPlayer } from "@/lib/stories";
import { sa_removeStoryPlayer } from "@/app/(app)/(nav)/stories/actions";
import { DeleteButton } from "@/components/confirm/delete-button";

type Props = {
  idStory: number;
  player: StoryPlayer;
  /** Called once the player is off the story, so the list can drop them. */
  onRemoved: () => void;
};

/**
 * The button beside a player on a story's page that takes them off it, and
 * the dialog that asks first (DeleteButton, with Remove for its verb: the
 * player lives on and can be invited back).
 *
 * Taking a seat away is not undoable from here, and it takes their favorite
 * of the story with it, so the dialog names the player and says what else
 * goes.
 */
export function RemovePlayerButton({ idStory, player, onRemoved }: Props) {
  return (
    <DeleteButton
      thing={player.name}
      label={`Remove ${player.name}`}
      verb="Remove"
      icon={<UserMinus size={14} />}
      onDelete={() => sa_removeStoryPlayer(idStory, player.idUser)}
      onDeleted={onRemoved}
      done={`${player.name} is no longer a player.`}
      failed="They could not be removed. Try again."
    >
      {player.name} will no longer be a player of this story, and their favorite of it, if they have
      one, goes with them. They can be invited back.
    </DeleteButton>
  );
}
