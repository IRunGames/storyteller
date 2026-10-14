"use client";

import { useId, useState, type ComponentProps } from "react";
import { IconButton, Popover, Portal, Tooltip } from "@chakra-ui/react";
import { Info } from "lucide-react";
import { RunElementPanel } from "./run-element-panel";

type Props = Omit<ComponentProps<typeof RunElementPanel>, "heading"> & {
  /** Where the panel opens: below a pill, beside the library's list. */
  placement: "bottom-end" | "right-start";
};

/**
 * The library's info button: a popover holding the element panel
 * (RunElementPanel). The panel is mounted afresh each opening, so it loads
 * what is stored now rather than what it showed last time. While closed, the
 * popover keeps a title of its own in the page: zag links the dialog to its
 * Popover.Title only when one is there as the machine starts
 * (attachment-tags-popover.tsx), and the panel is not.
 */
export function RunElementInfoPopover({ placement, ...panel }: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  // Counts the openings, so each one mounts a new panel.
  const [openings, setOpenings] = useState(0);
  const { label } = panel;

  return (
    // Not lazyMount, for the title; see above.
    <Popover.Root
      ids={{ trigger: triggerId }}
      positioning={{ placement }}
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (details.open) setOpenings((count) => count + 1);
      }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton aria-label={`About ${label}`} size="xs" variant="ghost" rounded="full">
              <Info />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>About {label}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="sm" maxH="70vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Body>
              {open ? (
                <RunElementPanel
                  key={openings}
                  {...panel}
                  heading={(text) => <Popover.Title fontWeight="semibold">{text}</Popover.Title>}
                />
              ) : (
                <Popover.Title fontWeight="semibold">{label}</Popover.Title>
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
