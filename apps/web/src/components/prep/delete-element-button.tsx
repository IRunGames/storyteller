"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Dialog, Portal, Stack, Text } from "@chakra-ui/react";
import { Trash2 } from "lucide-react";
import { sa_deleteElement } from "@/app/(app)/(nav)/libraries/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idElement: number;
  /** The element's name, for the question and the toast. */
  name: string;
};

/**
 * The edit page's Delete, and the dialog that asks first.
 *
 * Deleting is not undoable, and it reaches further than the page shows: the
 * element leaves every scene it was brought into, with its status and stack
 * there, so the dialog says so. Its picture is an attachment of the story
 * or a scene, which stays. role="alertdialog", as RemovePlayerButton's is:
 * a decision to confirm, which takes the focus with it.
 *
 * A refusal stays in the dialog as an inline alert; success goes back to the
 * story's board with a toast, since the page it was on is gone.
 */
export function DeleteElementButton({ idElement, name }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const result = await sa_deleteElement(idElement);
      if (!result.ok) {
        setError(result.error);
        setDeleting(false);
        return;
      }
      toaster.create({ title: `${name} has been deleted.`, type: "success" });
      // Still deleting while the board loads, so the dialog does not offer
      // to delete it again.
      router.push(`/libraries/${result.idStory}`);
    } catch {
      setError("The element could not be deleted. Try again.");
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
      <Dialog.Trigger asChild>
        <Button type="button" variant="outline" colorPalette="red">
          <Trash2 />
          Delete element
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Delete {name}?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="3">
                <Text>
                  {name} will be removed from the story entirely, and from every scene it is in,
                  with its status and stack there. Its picture stays among the attachments. This
                  cannot be undone.
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
                Delete
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
