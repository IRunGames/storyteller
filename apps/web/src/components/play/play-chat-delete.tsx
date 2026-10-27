"use client";

import { useId, useState } from "react";
import { Button, HStack, IconButton, Popover, Portal, Text, Tooltip } from "@chakra-ui/react";
import { Trash2 } from "lucide-react";
import { sa_deleteChat } from "@/app/(app)/play/[id]/actions";

type Props = {
  idStory: number;
  idChat: number;
  /** The line is gone: drop it from the chat. */
  onDeleted: (idChat: number) => void;
  /** The compact chat's smaller bin. */
  small?: boolean;
};

/**
 * The bin beside the pencil on a line of the viewer's own, and the popover
 * that asks before taking it back (sa_deleteChat), since a deleted line is
 * gone for everyone at the table. A refusal stays in the popover with the
 * reason. The tooltip and popover share the button's id, as every icon
 * button that opens something does (docs/standards.md).
 */
export function PlayChatDelete({ idStory, idChat, onDeleted, small = false }: Props) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerId = useId();

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const result = await sa_deleteChat(idStory, idChat);
      if (result.ok) {
        setOpen(false);
        onDeleted(result.idChat);
        return;
      }
      setError(result.error);
    } catch {
      setError("The message could not be deleted. Try again.");
    }
    setDeleting(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        setError(null);
      }}
      positioning={{ placement: "bottom-end" }}
      ids={{ trigger: triggerId }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label="Delete message"
              variant="ghost"
              size="2xs"
              boxSize={small ? "5" : undefined}
              minW={small ? "5" : undefined}
              color="fg.muted"
              alignSelf="center"
              _icon={small ? { boxSize: "3" } : undefined}
            >
              <Trash2 />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Delete message</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="xs">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Delete this message?</Popover.Title>
            </Popover.Header>
            <Popover.Body pt="0">
              <Text textStyle="sm" color="fg.muted">
                It is taken back for everyone at the table.
              </Text>
              {error && (
                <Text role="alert" textStyle="sm" color="fg.error" mt="2">
                  {error}
                </Text>
              )}
            </Popover.Body>
            <Popover.Footer>
              <HStack gap="2" justify="end" w="full">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  colorPalette="red"
                  size="sm"
                  loading={deleting}
                  onClick={() => void remove()}
                >
                  Delete
                </Button>
              </HStack>
            </Popover.Footer>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
