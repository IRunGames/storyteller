"use client";

import { useState } from "react";
import { Button, Dialog, Portal, Text } from "@chakra-ui/react";
import { LogOut } from "lucide-react";
import { sa_leaveAsGuest } from "@/app/(app)/play/[id]/actions";

/**
 * A guest's way out of the display table. A guest has no account to come
 * back to, so leaving gives up their seat and, seated nowhere else, deletes
 * them (sa_leaveAsGuest). It asks first: role "alertdialog", as the
 * waiting room's leave dialog is, with staying the choice Escape or a click
 * outside makes. Afterwards the browser goes
 * to the landing page with a full load, so nothing of the table's state
 * outlives the guest.
 */
export function GuestLeaveButton({ idStory, title }: { idStory: number; title: string }) {
  const [open, setOpen] = useState(false);
  const [isLeaving, setLeaving] = useState(false);

  async function leave() {
    setLeaving(true);
    try {
      await sa_leaveAsGuest(idStory);
    } catch {
      // The guest is gone or their session already is; either way there is
      // no table to stay at.
    }
    window.location.assign("/");
  }

  return (
    <>
      <Button size="sm" variant="subtle" onClick={() => setOpen(true)}>
        <LogOut />
        Leave
      </Button>
      <Dialog.Root
        role="alertdialog"
        open={open}
        onOpenChange={(details) => {
          if (!details.open && !isLeaving) setOpen(false);
        }}
        placement="center"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Leave the table?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text>
                  You joined {title} as a guest, so leaving gives up your seat. The join link lets
                  you back in as a new guest.
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={isLeaving}>
                  Stay
                </Button>
                <Button
                  colorPalette="red"
                  onClick={leave}
                  loading={isLeaving}
                  loadingText="Leaving"
                >
                  Leave
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
