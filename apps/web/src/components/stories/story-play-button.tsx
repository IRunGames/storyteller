"use client";

import type { ComponentProps } from "react";
import NextLink from "next/link";
import { Button, Portal, Tooltip } from "@chakra-ui/react";
import { Play } from "lucide-react";
import type { StoryCardData } from "@/lib/stories";
import { StoryPlayPopover } from "./story-play-popover";

/** What Play needs to know about a story: whose it is, and who is at its table. */
export type PlayButtonStory = Pick<
  StoryCardData,
  "idStory" | "title" | "isOwner" | "hasOpenSession" | "waitingCount" | "presentCount"
>;

/**
 * What Play says about a story: the count it shows, whether it glows, its
 * accessible name and its tooltip. The count is the players at the table
 * while a session is open, and otherwise the players waiting for one; it
 * glows for either, an open session with nobody at it yet included, since
 * either is something to go to.
 */
export function playState(story: PlayButtonStory): {
  count: number;
  live: boolean;
  label: string;
  tooltip: string;
} {
  const players = (n: number) => `${n} ${n === 1 ? "player" : "players"}`;
  if (story.hasOpenSession) {
    const n = story.presentCount;
    return {
      count: n,
      live: true,
      label: `Play, ${players(n)} at the table`,
      tooltip: `Session in progress · ${n} at the table`,
    };
  }
  if (story.waitingCount > 0) {
    const n = story.waitingCount;
    return {
      count: n,
      live: true,
      label: `Play, ${players(n)} waiting`,
      tooltip: story.isOwner ? `Start playing · ${n} waiting` : `${n} waiting for the storyteller`,
    };
  }
  return {
    count: 0,
    live: false,
    label: "Play",
    tooltip: story.isOwner ? "Start playing" : "Go to the table",
  };
}

type FaceProps = Omit<ComponentProps<typeof Button>, "children"> & {
  /** Shown in parentheses after the word, "Play (2)"; nothing at 0. */
  count: number;
  /** Players waiting or a session open: the button glows. */
  live: boolean;
  /** The accessible name: "Play", or "Play, 3 players waiting". */
  label: string;
  /** Where it goes, making it a link; without one it is a button. */
  href?: string;
};

// The glow round a live Play: a ring in the button's own blue and a soft
// halo past it, so it reads on a cover, a panel or the page alike.
const GLOW = "0 0 0 2px var(--chakra-colors-blue-300), 0 0 16px 4px var(--chakra-colors-blue-400)";

/**
 * How Play looks everywhere it appears: a round blue button with the play
 * icon and the word, the count in parentheses after it, and a glow while
 * there is someone to play with. A link for a player, and the trigger of
 * the storyteller's session popover, which spreads its own props and ref
 * onto it, hence the rest props.
 *
 * On a story card it sits above the card's LinkOverlay, so the click is its
 * own and is stopped before the overlay's link sees it.
 */
function PlayButtonFace({ count, live, label, href, onClick, ...rest }: FaceProps) {
  const content = (
    <>
      <Play />
      Play{count > 0 && ` (${count})`}
    </>
  );
  return (
    <Button
      {...rest}
      aria-label={label}
      colorPalette="blue"
      rounded="full"
      gap="1"
      position="relative"
      zIndex="1"
      boxShadow={live ? GLOW : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      asChild={href !== undefined}
    >
      {href === undefined ? content : <NextLink href={href}>{content}</NextLink>}
    </Button>
  );
}

type Props = {
  /** The story to play, or null while none is chosen: Play then waits, greyed out. */
  story: PlayButtonStory | null;
  size?: "sm" | "md";
};

/**
 * Play, the one control every way into a table uses: the story cards, the
 * story page and the Play page. For the storyteller it opens the session
 * popover (StoryPlayPopover), where they choose a session or make a new one
 * before the table opens; for a player it is a link to the table,
 * /play/[id], which decides between the table, the waiting room and why the
 * story cannot be played.
 */
export function PlayButton({ story, size = "sm" }: Props) {
  if (story === null) {
    return <PlayButtonFace count={0} live={false} label="Play" size={size} disabled />;
  }

  const { count, live, label, tooltip } = playState(story);
  if (story.isOwner) {
    return (
      <StoryPlayPopover idStory={story.idStory} title={story.title} tooltip={tooltip}>
        <PlayButtonFace count={count} live={live} label={label} size={size} />
      </StoryPlayPopover>
    );
  }
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <PlayButtonFace
          count={count}
          live={live}
          label={label}
          size={size}
          href={`/play/${story.idStory}`}
        />
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{tooltip}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
