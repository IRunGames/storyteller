"use client";

import { useId, useState } from "react";
import { HStack, Popover, Portal } from "@chakra-ui/react";
import { Pencil } from "lucide-react";
import { DeleteSessionButton } from "@/components/stories/delete-session-button";
import { SessionEditPanel, type SessionSaved } from "@/components/stories/session-edit-panel";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";

type Props = {
  idStorySession: number;
  /** The sitting's heading, which names the button and heads the panel. */
  heading: string;
  /** The session as saved, for the band to show. */
  onSaved: (saved: SessionSaved) => void;
  /** The session is gone; the lane goes with it. */
  onDeleted: () => void;
};

/**
 * The pencil on a sitting's band on the storyteller's board, and the panel
 * it opens: the Timeline's session edit panel (SessionEditPanel), which
 * there sits under the row, here in a popover, since a band has no room
 * under it that is not its scenes. The panel is only drawn while open, so
 * each opening reads the session as stored now. The panel itself closes
 * on a save and says so; the band follows what was saved.
 *
 * The Timeline's trashcan (DeleteSessionButton) sits at the top right of the
 * popover, beside the sitting's name: on the Timeline it is on the row,
 * and a band has no room for a second button that is not seen before it
 * is wanted. Deleting takes the lane away, popover and all.
 */
export function SessionEditPopover({ idStorySession, heading, onSaved, onDeleted }: Props) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const label = `Edit ${heading}`;

  return (
    <Popover.Root
      ids={{ trigger: triggerId }}
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: "bottom-start" }}
    >
      <IconButtonWithTooltip
        label={label}
        aria-expanded={open}
        color="inherit"
        _hover={{ bg: "blackAlpha.200" }}
        popoverTrigger={triggerId}
      >
        <Pencil size={16} />
      </IconButtonWithTooltip>
      <Portal>
        <Popover.Positioner>
          {/* The panel runs long with its pictures and scenes, so it
              scrolls inside itself rather than off the foot of the page. */}
          <Popover.Content w="md" maxH="80vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Header>
              <HStack justify="space-between" gap="2">
                <Popover.Title fontWeight="semibold">{heading}</Popover.Title>
                <DeleteSessionButton
                  idStorySession={idStorySession}
                  heading={heading}
                  onDeleted={onDeleted}
                />
              </HStack>
            </Popover.Header>
            <Popover.Body>
              {open && (
                <SessionEditPanel
                  idStorySession={idStorySession}
                  onSaved={onSaved}
                  onClose={() => setOpen(false)}
                />
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
