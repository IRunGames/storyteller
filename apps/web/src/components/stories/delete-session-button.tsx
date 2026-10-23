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
import { sa_deleteStorySession } from "@/app/(app)/(nav)/stories/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStorySession: number;
  /** "3. Kildealg", to name the button per row and the question. */
  heading: string;
  /** The session is gone, so the row can go too. */
  onDeleted: () => void;
};

/**
 * A Timeline row's bin, and the popover that asks before it deletes, as an
 * attachment card's does: the session cannot be brought back. The question
 * says what goes with it, since a finished session can be deleted too and
 * may carry a sitting's worth of history: its scenes stay in the story but
 * lose their link to it, and the record of who came to it goes.
 */
export function DeleteSessionButton({ idStorySession, heading, onDeleted }: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [isDeleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      const result = await sa_deleteStorySession(idStorySession);
      if (!result.ok) {
        toaster.create({ title: result.error, type: "error" });
        return;
      }
      setOpen(false);
      onDeleted();
      toaster.create({ title: "Session deleted", type: "success" });
    } catch {
      toaster.create({ title: "The session could not be deleted. Try again.", type: "error" });
    } finally {
      setDeleting(false);
    }
  }

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
            <IconButton
              size="xs"
              variant="ghost"
              rounded="full"
              colorPalette="red"
              aria-label={`Delete ${heading}`}
            >
              <Trash2 />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Delete session</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="xs">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Delete {heading}?</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="3">
                <Text fontSize="sm">
                  This permanently deletes the session and the record of who came to it. Its scenes
                  stay in the story, but each loses its link to this session.
                </Text>
                <Text fontSize="sm" fontWeight="medium">
                  It cannot be undone.
                </Text>
                {/* Cancel at the start and the action at the end, as the
                    forms lay them out. */}
                <HStack justify="space-between" gap="2">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="red"
                    loading={isDeleting}
                    onClick={() => void remove()}
                  >
                    Delete
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
