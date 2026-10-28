"use client";

import { useState } from "react";
import { Button, Dialog, Portal, Text } from "@chakra-ui/react";
import { sa_suspendInactiveSession } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { ANSWER_WITHIN_MS, INACTIVE_AFTER_MS, useInactivity } from "./use-inactivity";

type Props = {
  idStory: number;
  idStorySession: number;
  /** The session is being played (OPEN or RESUMED); nothing is watched otherwise. */
  isPlaying: boolean;
  /** The session has been suspended, with the status it now has. */
  onSuspended: (status: string) => void;
};

const minutes = (ms: number) => Math.round(ms / 60_000);

/**
 * The run table's inactivity check. While the session is being played and
 * nothing has happened at the table for a while (useInactivity), it asks
 * whether the storyteller is still playing. Yes carries on. No, or no
 * answer in time, suspends the session (sa_suspendInactiveSession), which
 * notes in the session's activity_log that it was suspended for inactivity,
 * and the table shows the pause as a suspension from the chip would.
 *
 * role "alertdialog", as the other questions at the table are. Escape or a
 * click outside counts as yes: someone pressed something, so someone is
 * there.
 */
export function InactivityCheck({ idStory, idStorySession, isPlaying, onSuspended }: Props) {
  const [suspending, setSuspending] = useState(false);

  async function suspend(answered: boolean) {
    setSuspending(true);
    try {
      const result = await sa_suspendInactiveSession(idStory, idStorySession, answered);
      if (result.ok) {
        onSuspended(result.status);
        toaster.create({ title: "The session was suspended for inactivity.", type: "info" });
      } else {
        toaster.create({ title: result.error, type: "error" });
      }
    } catch {
      toaster.create({ title: "The session could not be suspended.", type: "error" });
    } finally {
      setSuspending(false);
    }
  }

  const { asking, stillHere } = useInactivity({
    enabled: isPlaying,
    onTimeout: () => void suspend(false),
  });

  return (
    <Dialog.Root
      role="alertdialog"
      open={asking}
      onOpenChange={(details) => {
        if (!details.open && !suspending) stillHere();
      }}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Are you still playing?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text>
                Nothing has happened at this table for {minutes(INACTIVE_AFTER_MS)} minutes. If
                there is no answer within {minutes(ANSWER_WITHIN_MS)} minutes, the session is
                suspended.
              </Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                variant="outline"
                // The question stays up, loading, until the action answers;
                // closing it after a refusal starts the wait again.
                onClick={async () => {
                  await suspend(true);
                  stillHere();
                }}
                loading={suspending}
                loadingText="Suspending"
              >
                No, suspend the session
              </Button>
              <Button onClick={stillHere} disabled={suspending}>
                Yes, still playing
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
