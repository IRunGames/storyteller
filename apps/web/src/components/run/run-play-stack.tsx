"use client";

import { useId } from "react";
import { Heading, HStack, List, Stack, Text } from "@chakra-ui/react";
import type { PlayItem, PlayStack } from "@/lib/run";
import { RunNewElementPopover } from "./run-new-element-popover";
import { RunPlayPill } from "./run-play-pill";

type Props = {
  idStory: number;
  stack: PlayStack;
  /** Every stack's tag, in order, for each pill's Move to. */
  sceneTags: string[];
  /** The scene the table is on; null for none, which leaves out the +. */
  idStoryScene: number | null;
  /** A new element made from the stack's +, already linked to the scene. */
  onCreated: (item: PlayItem) => void;
  /** Takes an item off the play space. */
  onRemove: (key: string) => void;
  /** An item's scene status has changed from its eye. */
  onStatusChange: (key: string, status: string) => void;
  /** An item has been edited from its info popover. */
  onItemChange: (item: PlayItem) => void;
};

// Widening blurs of the background colour, the tightest repeated, so the
// halo is solid close to the letters and fades out rather than ending in a
// hard edge.
const HALO_COLOUR = "var(--chakra-colors-bg)";
const HALO = [1, 1, 2, 4, 8, 12].map((px) => `0 0 ${px}px ${HALO_COLOUR}`).join(", ");
const HALO_FILTER = [1, 2, 4, 6].map((px) => `drop-shadow(0 0 ${px}px ${HALO_COLOUR})`).join(" ");

/**
 * One stack of the storyteller's play space: a scene tag, the + that makes
 * a new element filed under it, and the items it holds (playStacks says
 * which). The stack has no background of its own, so the scene's cover
 * shows through around it; the heading has a halo and each item is a pill
 * (RunPlayPill) on the panel colour, 45% see-through. The pill blurs what is
 * behind it, so the cover shows through as colour without its detail
 * fighting the text.
 */
export function RunPlayStack({
  idStory,
  stack,
  sceneTags,
  idStoryScene,
  onCreated,
  onRemove,
  onStatusChange,
  onItemChange,
}: Props) {
  const headingId = useId();

  return (
    <Stack
      as="section"
      aria-labelledby={headingId}
      gap="2"
      w={{ base: "full", md: "xs" }}
      flexShrink="0"
    >
      {/* The tag and its + stand out from the cover by a halo in the page's
          background colour rather than a box behind them: dark text gets a
          light halo and light text a dark one, whichever theme is on, and
          with no cover the halo is the page itself and shows as nothing. */}
      <HStack justify="space-between" gap="2" css={{ "& svg": { filter: HALO_FILTER } }}>
        {/* Padded, since truncate's overflow clip would cut the halo off at
            the heading's own edges. Upper case by CSS only, so the tag
            keeps its own spelling for a screen reader and the tests. */}
        <Heading
          id={headingId}
          size="xs"
          truncate
          textShadow={HALO}
          textTransform="uppercase"
          letterSpacing="wider"
          px="2"
          py="1"
        >
          {stack.title}
        </Heading>
        {idStoryScene !== null && (
          <RunNewElementPopover
            idStory={idStory}
            idStoryScene={idStoryScene}
            tag={stack.tag}
            title={stack.title}
            onCreated={onCreated}
          />
        )}
      </HStack>
      {stack.items.length === 0 ? (
        <Text fontSize="sm" color="fg.muted">
          Nothing here yet.
        </Text>
      ) : (
        <List.Root listStyleType="none" gap="2">
          {stack.items.map((item) => (
            <List.Item key={item.key}>
              <RunPlayPill
                idStory={idStory}
                idStoryScene={idStoryScene}
                item={item}
                stackTag={stack.tag}
                otherStacks={sceneTags.filter((tag) => tag !== stack.tag)}
                onRemove={onRemove}
                onStatusChange={onStatusChange}
                onItemChange={onItemChange}
              />
            </List.Item>
          ))}
        </List.Root>
      )}
    </Stack>
  );
}
