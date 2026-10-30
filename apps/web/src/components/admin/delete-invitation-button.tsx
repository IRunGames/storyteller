"use client";

import { useState } from "react";
import { Alert, Button, Dialog, IconButton, Portal, Text, Tooltip } from "@chakra-ui/react";
import { Trash2 } from "lucide-react";
import {
  sa_deleteInvitation,
  type AdminInvitation,
} from "@/app/(app)/(nav)/admin/invitations/actions";
import { toaster } from "@/components/ui/toaster";

/**
 * The trash button on a row of the Invitations table, and the dialog that
 * asks first, as DeleteSceneButton does. Deleting a waiting invitation kills
 * its link; deleting an accepted one only removes the record, which the
 * dialog says so nobody expects the seat or the account type to go with it.
 */
export function DeleteInvitationButton({
  invitation,
  onDeleted,
}: {
  invitation: AdminInvitation;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await sa_deleteInvitation(invitation.idInvitation);
      setOpen(false);
      onDeleted();
      toaster.create({
        title: `The invitation to ${invitation.email} was deleted.`,
        type: "success",
      });
    } catch {
      setError("The invitation could not be deleted. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog.Root
      role="alertdialog"
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (!details.open) setError(null);
      }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
        <Tooltip.Trigger asChild>
          <Dialog.Trigger asChild>
            <IconButton
              type="button"
              aria-label={`Delete the invitation to ${invitation.email}`}
              variant="ghost"
              size="xs"
            >
              <Trash2 />
            </IconButton>
          </Dialog.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Delete</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Delete the invitation to {invitation.email}?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text>
                {invitation.status === "accepted"
                  ? "It has been accepted, so only the record goes; what it gave stays. This cannot be undone."
                  : "Its link will stop working at once. This cannot be undone."}
              </Text>
              {error && (
                <Alert.Root role="alert" status="error" size="sm" mt="3">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              )}
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" disabled={isDeleting}>
                  Cancel
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="red"
                onClick={() => void remove()}
                loading={isDeleting}
                loadingText="Deleting"
              >
                Delete
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
