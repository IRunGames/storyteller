"use client";

import { sa_deleteChat } from "@/app/(app)/play/[id]/actions";
import { DeleteButton } from "@/components/confirm/delete-button";

type Props = {
  idStory: number;
  idChat: number;
  /** The line is gone: drop it from the chat. */
  onDeleted: (idChat: number) => void;
  /** The compact chat's smaller trashcan. */
  small?: boolean;
};

/**
 * The trashcan beside the pencil on a line of the viewer's own, and the popover
 * that asks before taking it back (DeleteButton over sa_deleteChat), since a
 * deleted line is gone for everyone at the table. No toast: the line
 * leaving the chat says it.
 */
export function PlayChatDelete({ idStory, idChat, onDeleted, small = false }: Props) {
  return (
    <DeleteButton
      thing="this message"
      label="Delete message"
      size="2xs"
      compact={small}
      onDelete={async () => {
        const result = await sa_deleteChat(idStory, idChat);
        if (result.ok) onDeleted(result.idChat);
        return result;
      }}
      done={null}
      failed="The message could not be deleted. Try again."
    >
      It is taken back for everyone at the table.
    </DeleteButton>
  );
}
