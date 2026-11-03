"use client";

import { useId, useState } from "react";
import { IconButton, Popover, Portal, Tooltip } from "@chakra-ui/react";
import { Pencil } from "lucide-react";
import { SessionEditPanel, type SessionSaved } from "@/components/stories/session-edit-panel";

type Props = {
  idStorySession: number;
  /** The sitting's heading, which names the button and heads the panel. */
  heading: string;
  /** The session as saved, for the band to show. */
  onSaved: (saved: SessionSaved) => void;
};

/**
 * The pencil on a sitting's band on the storyteller's board, and the panel
 * it opens: the Timeline's session edit panel (SessionEditPanel), which
 * there sits under the row, here in a popover, since a band has no room
 * under it that is not its scenes. The panel is only drawn while open, so
 * each opening reads the session as stored now. The panel itself closes
 * on a save and says so; the band follows what was saved.
 */
export function SessionEditPopover({ idStorySession, heading, onSaved }: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
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
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label={label}
              aria-expanded={open}
              size="xs"
              variant="ghost"
              rounded="full"
              color="inherit"
              _hover={{ bg: "blackAlpha.200" }}
            >
              <Pencil size={16} />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>{label}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          {/* The panel runs long with its pictures and scenes, so it
              scrolls inside itself rather than off the foot of the page. */}
          <Popover.Content w="md" maxH="80vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Header>
              <Popover.Title fontWeight="semibold">{heading}</Popover.Title>
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
