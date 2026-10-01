"use client";

import { useId, useState } from "react";
import {
  Button,
  HStack,
  IconButton,
  Popover,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Trash2 } from "lucide-react";

type Props = {
  /** What the attachment is called, to name the button per card. */
  label: string;
  /** A file we hold goes from storage as well; a typed link only loses its row. */
  isUploaded: boolean;
  isCover: boolean;
  onRemove: () => void;
};

/**
 * The card's bin button, and the popover that asks before it deletes. A
 * removal cannot be taken back (the row goes, and an upload's file goes from
 * Blob with it), so one stray press must not be enough.
 */
export function AttachmentRemoveButton({ label, isUploaded, isCover, onRemove }: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      ids={{ trigger: triggerId }}
      positioning={{ placement: "top-end" }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            {/* subtle red: soft enough to sit beside the other controls
                without shouting, still marked as the one that takes
                something away. */}
            <IconButton
              size="xs"
              variant="subtle"
              colorPalette="red"
              aria-label={`Remove ${label}`}
            >
              <Trash2 />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Remove Attachment</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="xs">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Remove this attachment?</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="3">
                <Text fontSize="sm">
                  {isUploaded
                    ? "This permanently deletes the attachment and its uploaded file."
                    : "This permanently deletes the attachment."}{" "}
                  It cannot be undone.
                  {isCover && " It is the cover, so there will be none until you choose another."}
                </Text>
                <HStack justify="flex-end" gap="2">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="red"
                    onClick={() => {
                      setOpen(false);
                      onRemove();
                    }}
                  >
                    Remove
                  </Button>
                </HStack>
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
