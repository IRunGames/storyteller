"use client";

import { useState } from "react";
import { Alert, Button, Dialog, IconButton, Portal, Stack, Text, Tooltip } from "@chakra-ui/react";
import { Trash2 } from "lucide-react";
import { sa_deleteStoryScene } from "@/app/(app)/(nav)/libraries/actions";
import { toaster } from "@/components/ui/toaster";

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
 * that asks first.
 *
 * Every scene asks, since deleting is not undoable and the button sits
 * beside Edit and Preview. A completed scene asks harder: it is part of the
 * record of a session that was played, so the dialog says which one and the
 * confirm reads "Delete anyway". It is still allowed; the storyteller owns
 * that record. role="alertdialog", as RemovePlayerButton's is: a decision to
 * confirm, which takes the focus with it.
 *
 * A refusal stays in the dialog as an inline alert; success is a toast,
 * since the card the storyteller was looking at is gone.
 */
export function DeleteSceneButton({
  idStoryScene,
  title,
  complete,
  sessionHeading,
  onDeleted,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const result = await sa_deleteStoryScene(idStoryScene);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onDeleted();
      toaster.create({ title: `${title} has been deleted.`, type: "success" });
    } catch {
      setError("The scene could not be deleted. Try again.");
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
              aria-label="Delete scene"
              variant="ghost"
              size="xs"
              rounded="full"
            >
              <Trash2 />
            </IconButton>
          </Dialog.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Delete scene</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Delete {title}?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="3">
                {complete && (
                  <Text fontWeight="medium">
                    {sessionHeading
                      ? `This scene has already been played, in ${sessionHeading}, and is part of that session's record.`
                      : "This scene has already been played, and is part of a session's record."}{" "}
                    Are you sure?
                  </Text>
                )}
                <Text>
                  {title} will be removed from the story, along with the elements brought into it
                  and their status there. The elements themselves stay, and so do its pictures,
                  among the attachments. This cannot be undone.
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
                {complete ? "Delete anyway" : "Delete"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
