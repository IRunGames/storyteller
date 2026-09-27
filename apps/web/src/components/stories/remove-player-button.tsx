"use client";

import { useState } from "react";
import { Alert, Button, Dialog, IconButton, Portal, Stack, Text, Tooltip } from "@chakra-ui/react";
import { UserMinus } from "lucide-react";
import type { StoryPlayer } from "@/lib/stories";
import { sa_removeStoryPlayer } from "@/app/(app)/(nav)/stories/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStory: number;
  player: StoryPlayer;
  /** Called once the player is off the story, so the list can drop them. */
  onRemoved: () => void;
};

/**
 * The button beside a player on a story's page that takes them off it, and
 * the dialog that asks first.
 *
 * Taking a seat away is not undoable from here — the storyteller would have
 * to invite them again — and it takes their favorite of the story with it,
 * so the dialog names the player and says what else goes. role="alertdialog"
 * rather than a plain dialog: it is a decision to confirm, not a panel to
 * read, and it takes the focus with it.
 *
 * A refusal stays in the dialog as an inline alert so it can be read and
 * retried; the confirmation is a toast, because by then the dialog the
 * storyteller was looking at has closed.
 */
export function RemovePlayerButton({ idStory, player, onRemoved }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, setRemoving] = useState(false);

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      const result = await sa_removeStoryPlayer(idStory, player.idUser);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onRemoved();
      toaster.create({ title: `${player.name} is no longer a player.`, type: "success" });
    } catch {
      setError("They could not be removed. Try again.");
    } finally {
      setRemoving(false);
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
              aria-label={`Remove ${player.name}`}
              variant="ghost"
              size="xs"
              rounded="full"
              color="fg.muted"
            >
              <UserMinus size={14} />
            </IconButton>
          </Dialog.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Remove player</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Remove {player.name}?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="3">
                <Text>
                  {player.name} will no longer be a player of this story, and their favorite of it,
                  if they have one, goes with them. They can be invited back.
                </Text>
                {error && (
                  // role="alert", which Chakra's Alert does not set itself.
                  <Alert.Root role="alert" status="error" size="sm">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" disabled={isRemoving}>
                  Cancel
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="red"
                onClick={remove}
                loading={isRemoving}
                loadingText="Removing"
              >
                Remove
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
