"use client";

import { Badge, Box, Flex, Heading, HStack, List, Stack, Text } from "@chakra-ui/react";
import { toPlayItem, type PlayScene } from "@/lib/play-scene";
import { playStacks } from "@/lib/run";
import type { SceneText } from "@/lib/scenes";
import { cssUrlValue } from "@/lib/stories";
import { sa_setPlaySceneText } from "@/app/(app)/play/[id]/actions";
import { PlayPill } from "./play-pill";
import { SceneTextPopover } from "./scene-text-popover";
import type { ChannelStatus } from "./use-story-channel";

type Props = {
  idStory: number;
  scene: PlayScene;
  /** Where the live connection stands; the space says so only when it is not connected. */
  status: ChannelStatus;
  /** The scene's description and notes have been saved from the title's panel. */
  onTextChange: (text: SceneText) => void;
};

// The same halo the storyteller's stack headings carry, so a tag reads over
// the scene's cover; see run-play-stack.tsx for why it is a halo and not a box.
const HALO_COLOUR = "var(--chakra-colors-bg)";
const HALO = [1, 1, 2, 4, 8, 12].map((px) => `0 0 ${px}px ${HALO_COLOUR}`).join(", ");

// What the space says of each state the connection can be in short of
// connected; connected says nothing, since live is the usual state.
const STATUS_NOTES: Partial<Record<ChannelStatus, string>> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Offline: changes will show when the connection is back.",
  unavailable: "Live updates are off; reload to see changes.",
};

/**
 * The players' play space: the scene being played, its cover behind, and
 * its elements in the storyteller's stacks (playStacks), as read-only pills.
 * The chevron beside the title opens the scene's description and notes for
 * the players to write up (SceneTextPopover). With no session, or a session
 * on no scene yet, it says which.
 */
export function PlaySpace({ idStory, scene, status, onTextChange }: Props) {
  const note = STATUS_NOTES[status];
  const items = scene.items.map(toPlayItem);

  return (
    <Box as="section" aria-labelledby="play-space-heading" position="relative" flex="1" minH="0">
      {scene.coverUrl && (
        <>
          <Box
            aria-hidden
            data-testid="play-space-cover"
            position="absolute"
            inset="0"
            bgSize="cover"
            bgPos="center"
            style={{ backgroundImage: `url("${cssUrlValue(scene.coverUrl)}")` }}
          />
          <Box aria-hidden position="absolute" inset="0" bg="blackAlpha.400" />
        </>
      )}
      <Stack position="relative" h="full" overflowY="auto" gap="3" p="4">
        <HStack justify="space-between" gap="3" align="start">
          {/* The scene's title is what the space is about; the region keeps
              its own name for a screen reader. Centred over the stacks, in
              small caps, as a scene's title is set on a page. */}
          {scene.scene === null ? (
            <Heading id="play-space-heading" size="sm">
              Play space
            </Heading>
          ) : (
            <>
              <Heading id="play-space-heading" srOnly>
                Play space
              </Heading>
              <HStack flex="1" minW="0" justify="center" gap="1">
                <Heading
                  size="xl"
                  minW="0"
                  textAlign="center"
                  fontVariant="small-caps"
                  letterSpacing="wide"
                  textShadow={HALO}
                  truncate
                >
                  {scene.scene.title}
                </Heading>
                <SceneTextPopover
                  title={scene.scene.title}
                  text={scene.scene.text}
                  save={(values) => sa_setPlaySceneText(idStory, scene.scene!.idStoryScene, values)}
                  onSaved={onTextChange}
                />
              </HStack>
            </>
          )}
          {note && (
            <Badge variant="subtle" colorPalette="orange" flexShrink="0">
              {note}
            </Badge>
          )}
        </HStack>

        {scene.idStorySession === null ? (
          <Text color="fg.muted">No session is being played.</Text>
        ) : scene.scene === null ? (
          <Text color="fg.muted">The storyteller has not chosen a scene yet.</Text>
        ) : (
          <Flex gap="3" wrap="wrap" align="flex-start" justify="space-between">
            {playStacks(scene.tags, items).map((stack) => (
              <Stack
                key={stack.title}
                as="section"
                aria-label={stack.title}
                gap="2"
                w={{ base: "full", md: "22rem" }}
                flexShrink="0"
              >
                <Heading
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
                {stack.items.length === 0 ? (
                  <Text fontSize="sm" color="fg.muted" textShadow={HALO}>
                    Nothing here yet.
                  </Text>
                ) : (
                  <List.Root listStyleType="none" gap="2">
                    {stack.items.map((item) => (
                      <List.Item key={item.key}>
                        <PlayPill item={item} />
                      </List.Item>
                    ))}
                  </List.Root>
                )}
              </Stack>
            ))}
          </Flex>
        )}
      </Stack>
    </Box>
  );
}
