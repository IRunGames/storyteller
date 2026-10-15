"use client";

import { IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Star } from "lucide-react";

type Props = {
  /** What the picture is called, to name the button. */
  label: string;
  /** Whether this picture is the cover: the star is then filled. */
  isCover: boolean;
  /** Pressed: the cover gives up its place, another picture takes it. */
  onToggle: () => void;
};

/**
 * The star in the lower corner of each of a link's pictures in the element
 * panel's In this scene card: filled on the cover, where pressing it moves
 * the picture down among the other images; empty on an other image, where
 * pressing it makes that picture the cover in the current one's place. A
 * toggle, so its name stays put and aria-pressed carries the state, as
 * AttachmentCoverButton on the attachment cards.
 */
export function RunCoverStar({ label, isCover, onToggle }: Props) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label={`Cover ${label}`}
          aria-pressed={isCover}
          size="2xs"
          variant={isCover ? "solid" : "subtle"}
          rounded="full"
          position="absolute"
          bottom="0.5"
          right="0.5"
          onClick={onToggle}
        >
          <Star fill={isCover ? "currentColor" : "none"} />
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>
            {isCover ? "Move down to the other images" : "Make this the cover"}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
