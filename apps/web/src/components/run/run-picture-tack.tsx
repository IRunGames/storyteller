"use client";

import { IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Pin, PinOff } from "lucide-react";

type Props = {
  /** What the pill calls the element, to name the button. */
  label: string;
  /** Whether this is the picture the storyteller last put up on the players' table. */
  pictureUp: boolean;
  onToggle: () => void;
};

/**
 * The tack in the upper right corner of a pill's thumbnail: puts the
 * element's picture up full size on the players' table, and takes it down
 * (the preview.open and preview.close pulses). A pin while the picture is
 * down, which puts it up; a pin struck through while it is up, which takes
 * it down. The tooltip says which way pressing it goes: "Show for players",
 * "Hide for players". The accessible name says whose
 * picture, so a table of pills tells them apart.
 *
 * Drawn over the picture, so it carries the dark band the preview's close
 * button does rather than a theme colour that might vanish into the image.
 */
export function RunPictureTack({ label, pictureUp, onToggle }: Props) {
  const tooltip = pictureUp ? "Hide for players" : "Show for players";
  const name = pictureUp
    ? `Hide ${label}'s picture from the players`
    : `Show ${label}'s picture to the players`;

  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label={name}
          aria-pressed={pictureUp}
          size="2xs"
          rounded="full"
          position="absolute"
          top="-1.5"
          right="-1.5"
          bg="blackAlpha.700"
          color="white"
          _hover={{ bg: "blackAlpha.800" }}
          onClick={onToggle}
        >
          {pictureUp ? <PinOff size={12} /> : <Pin size={12} />}
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{tooltip}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
