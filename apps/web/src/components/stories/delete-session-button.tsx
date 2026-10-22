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
  /** The session's status: a DONE one cannot be deleted. */
  status: string;
  /** The session is gone, so the row can go too. */
  onDeleted: () => void;
};

/**
 * A Timeline row's bin, and the popover that asks before it deletes, as an
 * attachment card's does: the session cannot be brought back. Its scenes
 * stay in the story with no sitting, which the question says.
 *
 * A DONE session is the record of what was played, so its bin is
 * aria-disabled rather than disabled, keeping it focusable for the tooltip
 * that says why (story-card.tsx does the same), and it opens nothing.
 */
export function DeleteSessionButton({ idStorySession, heading, status, onDeleted }: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const done = status === "DONE";

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
      onOpenChange={(details) => setOpen(details.open && !done)}
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
              colorPalette={done ? undefined : "red"}
              aria-label={`Delete ${heading}`}
              aria-disabled={done || undefined}
              opacity={done ? 0.4 : undefined}
              cursor={done ? "not-allowed" : undefined}
            >
              <Trash2 />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>
              {done ? "Cannot delete DONE sessions" : "Delete session"}
            </Tooltip.Content>
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
                  This permanently deletes the session. Its scenes stay in the story, in no session.
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
