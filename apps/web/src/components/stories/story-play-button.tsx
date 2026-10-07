"use client";

import type { ComponentProps } from "react";
import NextLink from "next/link";
import { Button, IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Play } from "lucide-react";

type FaceProps = Omit<ComponentProps<typeof Button>, "children"> & {
  /**
   * The number to put on the button, which also highlights it; null for the
   * plain round icon button.
   */
  count: number | null;
  /** The accessible name: "Play", or "Play, 3 players waiting". */
  label: string;
  /** Where it goes, making it a link; without one it is a button. */
  href?: string;
};

/**
 * How Play looks on a story card, whatever it does: a plain white outline
 * while there is nothing to go to; with something to count, a pill in the theme's
 * highlight with the count before the arrow, "(3) ▶". A link for a player,
 * and the trigger of the storyteller's session popover, which spreads its
 * own props and ref onto it, hence the rest props.
 *
 * It sits above the card's LinkOverlay, so the click is its own and is
 * stopped before the overlay's link sees it.
 */
export function PlayButtonFace({ count, label, href, onClick, ...rest }: FaceProps) {
  const icon = <Play size={18} />;
  const content = count === null ? icon : <>({count}){icon}</>;
  const props = {
    ...rest,
    "aria-label": label,
    size: "sm" as const,
    rounded: "full",
    position: "relative" as const,
    zIndex: "1",
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onClick?.(event);
    },
    asChild: href !== undefined,
  };
  const body = href === undefined ? content : <NextLink href={href}>{content}</NextLink>;

  // Plain is an outline in the white the card's other controls wear over
  // the cover, not Chakra's default solid button: the theme fills that with
  // its accent, which is the same colour as play.accent, so a plain button
  // would read as highlighted. Colour is kept for when there is something
  // to go to.
  return count === null ? (
    <IconButton
      {...props}
      variant="outline"
      color="whiteAlpha.900"
      borderColor="whiteAlpha.600"
      _hover={{ bg: "whiteAlpha.200" }}
    >
      {body}
    </IconButton>
  ) : (
    <Button {...props} gap="1" bg="play.accent" color="play.contrast">
      {body}
    </Button>
  );
}

type Props = {
  idStory: number;
  count: number | null;
  label: string;
  tooltip: string;
};

/**
 * A player's Play: a link to the story's table, /play/[id], which decides
 * whether they see the table, the waiting room or why the story cannot be
 * played.
 */
export function StoryPlayButton({ idStory, count, label, tooltip }: Props) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <PlayButtonFace count={count} label={label} href={`/play/${idStory}`} />
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{tooltip}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
