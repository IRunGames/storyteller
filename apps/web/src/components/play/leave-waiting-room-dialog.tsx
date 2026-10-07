"use client";

import { Button, Dialog, Portal, Text } from "@chakra-ui/react";

type Props = {
  /** The story whose waiting room it is, named in the question. */
  title: string;
  open: boolean;
  /** True while the waiting row is being deleted, before moving on. */
  isLeaving: boolean;
  onLeave: () => void;
  onStay: () => void;
};

/**
 * Asks before a player follows a link out of the waiting room: leaving gives
 * up their place, and the count other players see drops by one. role
 * "alertdialog", as the remove-player dialog is: it is a decision to
 * confirm. Staying is the safe choice and the one Escape or a click outside
 * makes.
 */
export function LeaveWaitingRoomDialog({ title, open, isLeaving, onLeave, onStay }: Props) {
  return (
    <Dialog.Root
      role="alertdialog"
      open={open}
      onOpenChange={(details) => {
        if (!details.open && !isLeaving) onStay();
      }}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Stop waiting?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text>
                Leaving this page takes you out of the waiting room for {title}. You will not be
                taken to the table when the storyteller opens it.
              </Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={onStay} disabled={isLeaving}>
                Keep waiting
              </Button>
              <Button colorPalette="red" onClick={onLeave} loading={isLeaving} loadingText="Leaving">
                Leave
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
