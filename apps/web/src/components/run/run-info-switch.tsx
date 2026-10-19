"use client";

import { Box, HStack, Portal, Switch, Tooltip } from "@chakra-ui/react";
import { Info, Slash } from "lucide-react";

type Props = {
  /** Whether the players' table shows the element's description. */
  showInfo: boolean;
  /** Pressed. Left out where nothing may change, in a complete scene: the switch is then only shown. */
  onToggle?: () => void;
};

/**
 * Whether the players see an element's description in the scene
 * (scene_elements.show_info), as a switch on the element panel's Info row,
 * with the two states drawn either side of it: the struck-through Info of
 * the pill's toggle (RunInfoToggle) on the left for hidden, the plain Info
 * on the right for shown, the way a light switch has its off and on. Each
 * icon is lit while it is the state in force. The tooltip says what
 * pressing it does, which way it stands. The pill keeps its one-button
 * toggle, where there is no room for a switch.
 */
export function RunInfoSwitch({ showInfo, onToggle }: Props) {
  const tooltip = showInfo ? "Hide info from the players" : "Show info to the players";
  return (
    <HStack gap="2">
      <Box
        as="span"
        position="relative"
        display="inline-flex"
        color={showInfo ? "fg.subtle" : "fg"}
        aria-hidden
      >
        <Info size={16} />
        <Box as="span" position="absolute" inset="0" display="inline-flex">
          <Slash size={16} />
        </Box>
      </Box>
      {/* The tooltip's trigger is the whole switch, its label element: the
          input is visually hidden, so the pointer never rests on it. */}
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
        <Tooltip.Trigger asChild>
          <Switch.Root
            size="sm"
            checked={showInfo}
            disabled={!onToggle}
            onCheckedChange={() => onToggle?.()}
          >
            {/* Chakra renders a checkbox input; role="switch" is the ARIA
                pattern for an on/off toggle and what tests query. */}
            <Switch.HiddenInput role="switch" aria-label="Show info to players" />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Root>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>{tooltip}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Box as="span" display="inline-flex" color={showInfo ? "fg" : "fg.subtle"} aria-hidden>
        <Info size={16} />
      </Box>
    </HStack>
  );
}
