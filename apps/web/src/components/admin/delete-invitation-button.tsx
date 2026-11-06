"use client";

import {
  sa_deleteInvitation,
  type AdminInvitation,
} from "@/app/(app)/(nav)/admin/invitations/actions";
import { DeleteButton } from "@/components/confirm/delete-button";

/**
 * The trash button on a row of the Invitations table, and the dialog that
 * asks first (DeleteButton). Deleting a waiting invitation kills its link;
 * deleting an accepted one only removes the record, which the dialog says
 * so nobody expects the seat or the account type to go with it.
 */
export function DeleteInvitationButton({
  invitation,
  onDeleted,
}: {
  invitation: AdminInvitation;
  onDeleted: () => void;
}) {
  const thing = `the invitation to ${invitation.email}`;
  return (
    <DeleteButton
      thing={thing}
      label={`Delete ${thing}`}
      onDelete={async () => {
        // Answers ok either way: an invitation already gone is gone.
        await sa_deleteInvitation(invitation.idInvitation);
      }}
      onDeleted={onDeleted}
      done={`The invitation to ${invitation.email} was deleted.`}
      failed="The invitation could not be deleted. Try again."
    >
      {invitation.status === "accepted"
        ? "It has been accepted, so only the record goes; what it gave stays. This cannot be undone."
        : "Its link will stop working at once. This cannot be undone."}
    </DeleteButton>
  );
}
