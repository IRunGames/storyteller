"use client";

import { Box, IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Info, Slash } from "lucide-react";

type Props = {
  /** Whether the players' table shows the element's description. */
  showInfo: boolean;
  /**
   * Pressed. Left out where nothing may change, in a complete scene: the
   * toggle then only shows which way it is, and says so.
   */
  onToggle?: () => void;
};

/**
 * Whether the players see an element's description in the scene
 * (scene_elements.show_info), as a toggle: on a pill, left of its status
 * menu, and in the element panel's In this scene rows, both pressing the
 * same way. Solid while the info shows. Lucide has no crossed-out Info, so
 * its Slash is laid over the Info when the info is kept back, as
 * PlayerCount does for nobody; Ban is the DISABLED status beside this on
 * the pill.
 */
export function RunInfoToggle({ showInfo, onToggle }: Props) {
  const label = showInfo
    ? "Showing info to users"
    : onToggle
      ? "Info not showing – click to show"
      : "Info not showing";

  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label={label}
          aria-pressed={showInfo}
          // aria-disabled rather than disabled, so the tooltip still opens
          // and says which way the toggle is.
          aria-disabled={onToggle ? undefined : true}
          size="xs"
          variant={showInfo ? "solid" : "ghost"}
          rounded="full"
          onClick={onToggle}
        >
          <Box as="span" position="relative" display="inline-flex">
            <Info />
            {!showInfo && (
              <Box as="span" position="absolute" inset="0" display="inline-flex">
                <Slash />
              </Box>
            )}
          </Box>
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
