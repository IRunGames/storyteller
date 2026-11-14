"use client";

import { useRouter } from "next/navigation";
import { sa_deleteElement } from "@/components/prep/actions";
import { DeleteButton } from "@/components/confirm/delete-button";

type Props = {
  idElement: number;
  /** The element's name, for the question and the toast. */
  name: string;
};

/**
 * The edit page's trashcan, by its heading, and the popover that asks first
 * (DeleteButton).
 *
 * Deleting is not undoable, and it reaches further than the page shows: the
 * element leaves every scene it was brought into, with its status and stack
 * there, so the dialog says so. Its picture is an attachment of the story
 * or a scene, which stays. Success goes back to the story's board, since the
 * page it was on is gone.
 */
export function DeleteElementButton({ idElement, name }: Props) {
  const router = useRouter();
  return (
    <DeleteButton
      thing={name}
      label="Delete element"
      variant="outline"
      onDelete={async () => {
        const result = await sa_deleteElement(idElement);
        if (result.ok) router.push(`/stories/${result.idStory}/library`);
        return result;
      }}
      failed="The element could not be deleted. Try again."
    >
      {name} will be removed from the story entirely, and from every scene it is in, with its status
      and stack there. Its picture stays among the attachments. This cannot be undone.
    </DeleteButton>
  );
}
