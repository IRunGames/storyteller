"use client";

import { useState, type ReactNode } from "react";
import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  List,
  Stack,
  Text,
  type HeadingProps,
} from "@chakra-ui/react";
import { toPlayItem, type PlayScene } from "@/lib/play-scene";
import { elementIdOf, playStacks } from "@/lib/run";
import { SCENE_LOCKED_STATUS, SCENE_PENDING_STATUS, type SceneText } from "@/lib/scenes";
import { cssUrlValue } from "@/lib/stories";
import { sa_setPlaySceneText } from "@/app/(app)/play/[id]/actions";
import { AttachmentPreviewDialog } from "@/components/uploads/attachment-preview";
import { BackgroundToggle } from "./background-toggle";
import { PlayPill } from "./play-pill";
import { SceneStateOverlay } from "./scene-state-overlay";
import { SceneTextPopover } from "./scene-text-popover";
import type { ChannelStatus } from "./use-story-channel";

type Props = {
  idStory: number;
  scene: PlayScene;
  /**
   * Behind the space when there is no scene or the scene has no cover: the
   * players' table passes the story's cover, so the space is never bare
   * while the story has a picture. Left out, a scene without a cover shows
   * none.
   */
  fallbackCoverUrl?: string | null;
  /** Where the live connection stands; the space says so only when it is not connected. */
  status: ChannelStatus;
  /** The scene's description and notes have been saved from the title's panel. */
  onTextChange: (text: SceneText) => void;
  /** The players' notes on an element have been saved from its pill's info popover. */
  onNotesChange: (idElement: number, notes: string | null) => void;
  /** A pill has changed its link's status, or put it back after a refusal. */
  onStatusChange: (idElement: number, status: string) => void;
  /** The element whose picture the storyteller has put up full size, or null for none. */
  previewIdElement: number | null;
  /** The player closed that picture for themselves. */
  onPreviewClose: () => void;
  /**
   * A look at the scene rather than a seat at the table (/preview/scene):
   * the scene is shown whether or not a session is on it, its text and the
   * pills' info open to read, and nothing writes.
   */
  readOnly?: boolean;
  /** Each pill's info popover ends with the element's History (a scene's preview). */
  withHistory?: boolean;
  /** The eye in the upper right that puts everything away to show the cover (BackgroundToggle). */
  withBackgroundToggle?: boolean;
  /** Drawn either side of the scene's title: the preview's chevrons to the scenes before and after. */
  titleStart?: ReactNode;
  titleEnd?: ReactNode;
  /**
   * Draws the scene's title in place of the plain heading: the preview
   * makes it a dropdown of the story's scenes. Given the title and the
   * styling the heading carries, so it reads the same.
   */
  renderTitle?: (title: string, headingProps: HeadingProps) => ReactNode;
  /**
   * Drawn over the space while it is on no scene, in place of saying so: the
   * players' table passes the story's box (StoryPlayingBox), as the
   * storyteller's table shows it.
   */
  noSceneBox?: ReactNode;
};

// The same halo the storyteller's stack headings carry, so a tag reads over
// the scene's cover; see run-play-stack.tsx for why it is a halo and not a box.
const HALO_COLOUR = "var(--chakra-colors-bg)";
const HALO = [1, 1, 2, 4, 8, 12].map((px) => `0 0 ${px}px ${HALO_COLOUR}`).join(", ");

// How the scene's title is set: centred over the stacks, in small caps, as
// a scene's title is set on a page, with the halo over the cover.
const TITLE_PROPS: HeadingProps = {
  size: "xl",
  minW: "0",
  textAlign: "center",
  fontVariant: "small-caps",
  letterSpacing: "wide",
  textShadow: HALO,
  truncate: true,
};

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
 * The info button beside the title opens the scene's description and notes
 * for the players to write up (SceneTextPopover). With no session, or a session
 * on no scene yet, it says which.
 *
 * A picture the storyteller has put up from a pill's tack (the preview.open
 * pulse, held by the table as previewIdElement) is open full size over the
 * space, in the same preview a thumbnail opens, until the storyteller takes
 * it down or the player closes it for themselves. An element the table
 * does not hold, or one without a picture, shows nothing.
 *
 * Given withBackgroundToggle, an eye in the upper right puts away the
 * title, the stacks, the scene's overlay, the no-scene box and the cover's
 * dimming, leaving the cover alone until it is pressed again. The picture
 * the storyteller puts up stays: it is theirs to take down, not part of
 * the space.
 */
export function PlaySpace({
  idStory,
  scene,
  fallbackCoverUrl = null,
  status,
  onTextChange,
  onNotesChange,
  onStatusChange,
  previewIdElement,
  onPreviewClose,
  readOnly = false,
  withHistory = false,
  withBackgroundToggle = false,
  titleStart,
  titleEnd,
  renderTitle,
  noSceneBox,
}: Props) {
  const [showBackground, setShowBackground] = useState(false);
  const detailsHidden = withBackgroundToggle && showBackground;
  const note = STATUS_NOTES[status];
  const items = scene.items.map(toPlayItem);
  // A pending or complete scene is there to read, not to play in: the pills'
  // info and the scene's text open as they do on a preview, and nothing
  // writes, while the overlay says which it is.
  const held =
    scene.scene?.status === SCENE_PENDING_STATUS || scene.scene?.status === SCENE_LOCKED_STATUS;
  const lookOnly = readOnly || held;
  const coverUrl = scene.coverUrl ?? fallbackCoverUrl;
  const shown =
    previewIdElement === null
      ? null
      : (items.find((item) => elementIdOf(item) === previewIdElement && item.imageUrl) ?? null);

  return (
    <Box as="section" aria-labelledby="play-space-heading" position="relative" flex="1" minH="0">
      {coverUrl && (
        <>
          <Box
            aria-hidden
            data-testid="play-space-cover"
            position="absolute"
            inset="0"
            bgSize="cover"
            bgPos="center"
            style={{ backgroundImage: `url("${cssUrlValue(coverUrl)}")` }}
          />
          {!detailsHidden && <Box aria-hidden position="absolute" inset="0" bg="blackAlpha.400" />}
        </>
      )}
      {withBackgroundToggle && (
        // As tall as the title row (the title's xs info button) and at its
        // top, so the eye sits level with the title; it stays put while the
        // row is put away.
        <Flex position="absolute" top="4" right="4" zIndex="1" h="8" align="center">
          <BackgroundToggle
            isOn={showBackground}
            onToggle={() => setShowBackground(!showBackground)}
            controls="play-space-details"
          />
        </Flex>
      )}
      {/* Put away with display rather than taken out, so the pills' open
          popovers and half-written notes are there when it comes back. */}
      <Stack
        id="play-space-details"
        position="relative"
        h="full"
        overflowY="auto"
        gap="3"
        p="4"
        display={detailsHidden ? "none" : undefined}
      >
        {/* Room at the end of the row for the eye, so the connection badge
            and a long title never run under it. */}
        <HStack
          justify="space-between"
          gap="3"
          align="start"
          pe={withBackgroundToggle ? "8" : undefined}
        >
          {/* The scene's title is what the space is about; the region keeps
              its own name for a screen reader. Centred over the stacks, in
              small caps, as a scene's title is set on a page. */}
          {/* With no scene and the story's box to show, the box says what
              is being played, so the heading is for a screen reader only. */}
          {scene.scene === null ? (
            <Heading id="play-space-heading" size="sm" srOnly={noSceneBox !== undefined}>
              Play space
            </Heading>
          ) : (
            <>
              <Heading id="play-space-heading" srOnly>
                Play space
              </Heading>
              <HStack flex="1" minW="0" justify="center" gap="1">
                {titleStart}
                {renderTitle ? (
                  renderTitle(scene.scene.title, TITLE_PROPS)
                ) : (
                  <Heading {...TITLE_PROPS}>{scene.scene.title}</Heading>
                )}
                <SceneTextPopover
                  title={scene.scene.title}
                  text={scene.scene.text}
                  save={(values) => sa_setPlaySceneText(idStory, scene.scene!.idStoryScene, values)}
                  onSaved={onTextChange}
                  readOnly={lookOnly}
                  icon="info"
                />
                {titleEnd}
              </HStack>
            </>
          )}
          {note && (
            <Badge variant="subtle" colorPalette="orange" flexShrink="0">
              {note}
            </Badge>
          )}
        </HStack>

        {scene.idStorySession === null && !readOnly ? (
          <Text color="fg.muted">No session is being played.</Text>
        ) : scene.scene === null ? (
          noSceneBox === undefined && (
            <Text color="fg.muted">The storyteller has not chosen a scene yet.</Text>
          )
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
                        <PlayPill
                          idStory={idStory}
                          idStoryScene={scene.scene!.idStoryScene}
                          item={item}
                          onNotesChange={onNotesChange}
                          onStatusChange={onStatusChange}
                          readOnly={lookOnly}
                          withHistory={withHistory}
                        />
                      </List.Item>
                    ))}
                  </List.Root>
                )}
              </Stack>
            ))}
          </Flex>
        )}
      </Stack>
      {!detailsHidden && <SceneStateOverlay status={scene.scene?.status} />}
      {/* Keyed by the item, so a change of picture is a fresh dialog rather
          than one whose image swaps under it. No tags: the picture's tags are
          the attachment's, not the element's, as the pill's preview says. */}
      {shown && shown.imageUrl && (
        <AttachmentPreviewDialog
          key={shown.key}
          open
          onOpenChange={(open) => {
            if (!open) onPreviewClose();
          }}
          url={shown.imageUrl}
          label={shown.label}
          tags={[]}
          isCover={false}
          showTags={false}
        />
      )}
      {scene.scene === null && !detailsHidden && noSceneBox}
    </Box>
  );
}
