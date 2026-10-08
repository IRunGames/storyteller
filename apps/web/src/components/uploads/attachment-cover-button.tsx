"use client";

import { Button, IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Star } from "lucide-react";

type Props = {
  /** What the attachment is called, to name the button per row. */
  label: string;
  isCover: boolean;
  onToggle: () => void;
  /** Just the star, for a narrow list such as the run page's library. */
  compact?: boolean;
};

/**
 * The button that makes an attachment its object's cover, or stops it being
 * one: on each attachment card, and beside each attachment in the run page's
 * library. A toggle, so its name stays put and aria-pressed carries the
 * state; the filled star says the same thing to the eye. The tooltip says
 * what pressing it does, which on the cover is taking the cover away.
 *
 * Only for a READY row of a saved object, which the caller decides: anything
 * else has no picture to show, or no object to be the cover of yet.
 */
export function AttachmentCoverButton({ label, isCover, onToggle, compact = false }: Props) {
  const star = <Star size={14} fill={isCover ? "currentColor" : "none"} />;
  const common = {
    size: "xs",
    variant: isCover ? "solid" : "outline",
    type: "button",
    "aria-label": `Cover ${label}`,
    "aria-pressed": isCover,
    onClick: onToggle,
  } as const;

  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        {compact ? (
          <IconButton {...common}>{star}</IconButton>
        ) : (
          <Button {...common}>
            {star}
            Cover
          </Button>
        )}
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>
            {isCover ? "Stop using this as the cover image" : "Make this the cover image"}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
