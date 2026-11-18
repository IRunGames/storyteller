"use client";

import { useId, type ComponentProps } from "react";
import { Popover, Portal } from "@chakra-ui/react";
import { Info } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { RunElementPanel } from "./run-element-panel";

type Props = Omit<ComponentProps<typeof RunElementPanel>, "heading"> & {
  /** Where the panel opens: below a pill, beside the library's list. */
  placement: "bottom-end" | "right-start";
};

/**
 * The library's info button: a popover holding the element panel
 * (RunElementPanel). The panel is mounted afresh each opening, so it loads
 * what is stored now rather than what it showed last time. Not
 * InfoPopoverShell, because the panel draws the heading itself, reading
 * Edit while editing, where the shell's header would double it; but named
 * the way the shell names its dialog, outright, since a lazily mounted
 * popover's title is not found (info-popover-shell.tsx).
 */
export function RunElementInfoPopover({ placement, ...panel }: Props) {
  const triggerId = useId();
  const { label } = panel;

  return (
    <Popover.Root ids={{ trigger: triggerId }} positioning={{ placement }} lazyMount unmountOnExit>
      <IconButtonWithTooltip label={`About ${label}`} popoverTrigger={triggerId}>
        <Info />
      </IconButtonWithTooltip>
      <Portal>
        <Popover.Positioner>
          <Popover.Content aria-label={label} w="sm" maxH="70vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Body>
              <RunElementPanel
                {...panel}
                heading={(text) => <Popover.Title fontWeight="semibold">{text}</Popover.Title>}
              />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
