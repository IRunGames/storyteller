"use client";

import type { ReactNode } from "react";
import { Box, Flex, Heading, Stack } from "@chakra-ui/react";
import { CoverBackdrop } from "@/components/covers/cover-backdrop";
import { playStacks, type SceneItem } from "@/lib/scene-elements";
import type { useWideStacks } from "@/components/run/use-wide-stacks";
import { RunPlayStack } from "@/components/run/run-play-stack";

type Props = {
  /** Behind the space, or null for bare. */
  coverUrl: string | null;
  /** The scrolling part: the scene's title line and the stacks. */
  children: ReactNode;
  /** Over the stacks, saying so, but letting the pointer through: COMPLETE, SUSPENDED. */
  overlay?: ReactNode;
  /** After the overlays, so it stays above them: the story's box while the table is on no scene. */
  after?: ReactNode;
};

/**
 * The storyteller's play space, at the run table and on a scene's live-edit
 * page: the cover behind the scrolling part, so it stays put while the
 * stacks scroll over it, and a heading a screen reader names the region by,
 * since what reads as the title is the scene's own.
 */
export function TablePlaySpace({ coverUrl, children, overlay, after }: Props) {
  return (
    <Box as="section" aria-labelledby="play-space-heading" position="relative" flex="1" minH="0">
      {coverUrl && <CoverBackdrop url={coverUrl} scrim="flat" testId="play-space-cover" />}
      <Stack position="relative" h="full" overflowY="auto" gap="3" p="4">
        <Heading id="play-space-heading" srOnly>
          Play space
        </Heading>
        {children}
      </Stack>
      {overlay}
      {after}
    </Box>
  );
}

type StacksProps = {
  idStory: number;
  /** The scene the table is on; null for none, which leaves out each stack's +. */
  idStoryScene: number | null;
  /** The scene's stacks, in order. */
  tags: string[];
  items: SceneItem[];
  /** The scene is complete: each pill is there to read. */
  locked: boolean;
  /** Which stacks are widened to the whole space, and the button that changes it. */
  wideStacks: ReturnType<typeof useWideStacks>;
  /** The run table's tack: which pill's picture is up on the players' table, and the press. */
  pictureUpKey?: string | null;
  onPictureUpChange?: (key: string, up: boolean) => void;
};

/**
 * The storyteller's stacks across the play space (RunPlayStack), one per
 * scene tag with the Default stack first (playStacks). space-between: the
 * first stack against the left edge and the rest spread across the width.
 */
export function TableStacks({
  idStory,
  idStoryScene,
  tags,
  items,
  locked,
  wideStacks,
  pictureUpKey,
  onPictureUpChange,
}: StacksProps) {
  return (
    <Flex gap="3" wrap="wrap" align="flex-start" justify="space-between">
      {playStacks(tags, items).map((stack) => (
        <RunPlayStack
          key={stack.title}
          idStory={idStory}
          stack={stack}
          sceneTags={tags}
          idStoryScene={idStoryScene}
          pictureUpKey={pictureUpKey}
          onPictureUpChange={onPictureUpChange}
          locked={locked}
          wide={wideStacks.isWide(stack.tag)}
          onWideChange={(wide) => void wideStacks.setWide(stack.tag, wide)}
        />
      ))}
    </Flex>
  );
}
