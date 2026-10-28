"use client";

import { IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Eye } from "lucide-react";

/**
 * The small eye in the upper right of the players' play space and the display
 * table: pressed, everything over the scene's cover is put away so the
 * picture can be looked at whole; pressed again, it all comes back. Only for
 * someone with an account; the caller decides.
 *
 * A toggle button, so aria-pressed says which way it is and the tooltip says
 * what a press will do, as the table's other toggles do. Round and
 * see-through so it sits on the cover without hiding much of it, and solid
 * while pressed, being the one thing left on the screen.
 */
export function BackgroundToggle({
  isOn,
  onToggle,
  controls,
}: {
  /** The background is showing and the details are put away. */
  isOn: boolean;
  onToggle: () => void;
  /** The id of what the toggle hides, for aria-controls. */
  controls: string;
}) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label="Show background"
          aria-pressed={isOn}
          aria-controls={controls}
          size="2xs"
          variant={isOn ? "solid" : "subtle"}
          rounded="full"
          opacity={isOn ? 0.85 : 0.6}
          backdropFilter="blur(6px)"
          _hover={{ opacity: 1 }}
          _focusVisible={{ opacity: 1 }}
          onClick={onToggle}
        >
          <Eye />
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{isOn ? "Show details" : "Show background"}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
