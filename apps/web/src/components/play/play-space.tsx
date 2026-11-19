"use client";

import { useState, type ReactNode } from "react";
import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  Stack,
  Text,
  type HeadingProps,
} from "@chakra-ui/react";
import { Maximize2, Minimize2 } from "lucide-react";
import { toPlayItem, type PlayScene } from "@/lib/play-scene";
import { isStackWide, playStacks, stackKey } from "@/lib/scene-elements";
import { type SceneText } from "@/lib/scenes";
import { SCENE_LOCKED_STATUS, SCENE_PENDING_STATUS } from "@/lib/status";
import { useUser } from "@/components/auth/user-provider";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { CoverBackdrop } from "@/components/covers/cover-backdrop";
import { HALO } from "@/components/table-shell/halo";
import { PlayStackFrame } from "@/components/table-shell/play-stack-frame";
import { PulsedPicture } from "@/components/table-shell/pulsed-picture";
import { STATUS_NOTES } from "@/components/table-shell/status-notes";
import { BackgroundToggle } from "./background-toggle";
import { PlayPill } from "./play-pill";
import { SceneStateOverlay } from "@/components/table-shell/scene-state-overlay";
import { SceneTextPopover } from "./scene-text-popover";
import type { ChannelStatus } from "./use-story-channel";

/**
 * The three places a play space is drawn, which decide what it does.
 *
 * `table` is a seat at the players' table (PlayTable): live, following the
 * storyteller over the story's topic, its text and the pills' notes and
 * statuses written from here, with the story's box over the space while
 * the table is on no scene and, for anyone but a guest, the eye in the
 * upper right that puts everything away to show the cover (BackgroundToggle).
 *
 * `preview` is a look at the scene rather than a seat (/preview/scene): the
 * scene is shown whether or not a session is on it, its text and the pills'
 * info open to read, each pill's info ending with the element's History,
 * and nothing writes. The preview draws the scene's title itself, as a
 * dropdown of the story's scenes, with its chevrons either side.
 *
 * `card` is the storyboard's scene card grown open (SceneElementsPanel):
 * read only as the preview is, but without the title row, since the card's
 * face says the title and holds the text, and without the overlay that
 * says a pending or complete scene is not being played, since the card's
 * status badge says that and the word across every one would hide the
 * pills for nothing. The region keeps its name for a screen reader.
 */
type Variant =
  | {
      variant: "table";
      /**
       * Behind the space when there is no scene or the scene has no cover:
       * the story's cover, so the space is never bare while the story has a
       * picture.
       */
      fallbackCoverUrl: string | null;
      /** Where the live connection stands; the space says so only when it is not connected. */
      status: ChannelStatus;
      /** The scene's description and notes have been saved from the title's panel. */
      onTextChange: (text: SceneText) => void;
      /** The players' notes on an element have been saved from its pill's info popover. */
      onNotesChange: (idElement: number, notes: string | null) => void;
      /** A pill has changed its link's status, or put it back after a refusal. */
      onStatusChange: (idSceneElement: number, status: string) => void;
      /** The link whose picture the storyteller has put up full size, or null for none. */
      previewIdSceneElement: number | null;
      /** The player closed that picture for themselves. */
      onPreviewClose: () => void;
      /**
       * Drawn over the space while it is on no scene, in place of saying so:
       * the story's box (StoryPlayingBox), as the storyteller's table shows it.
       */
      noSceneBox: ReactNode;
    }
  | {
      variant: "preview";
      /** Drawn either side of the scene's title: the preview's chevrons to the scenes before and after. */
      titleStart?: ReactNode;
      titleEnd?: ReactNode;
      /**
       * Draws the scene's title in place of the plain heading: the preview
       * makes it a dropdown of the story's scenes. Given the title and the
       * styling the heading carries, so it reads the same.
       */
      renderTitle?: (title: string, headingProps: HeadingProps) => ReactNode;
    }
  | { variant: "card" };

type Props = { idStory: number; scene: PlayScene } & Variant;

/**
 * How wide each stack is drawn here: as the storyteller has it
 * (scene.wideTags), unless the player has pressed the stack's own expand
 * button since, which is this table's alone and told to nobody. The
 * storyteller's word wins: when they widen or narrow a stack, the player's
 * own setting for it goes, so what they put up is seen. Worked out during
 * render against the last wide set seen, the way React asks for state that
 * follows a prop, so no frame shows the old width; a new scene starts fresh.
 */
function useStackWidths(idStoryScene: number | null, wideTags: readonly string[] | undefined) {
  const [own, setOwn] = useState<Record<string, boolean>>({});
  const [seen, setSeen] = useState({ idStoryScene, wideTags });
  if (seen.idStoryScene !== idStoryScene || seen.wideTags !== wideTags) {
    setSeen({ idStoryScene, wideTags });
    const kept =
      seen.idStoryScene === idStoryScene
        ? Object.fromEntries(
            Object.entries(own).filter(
              ([key]) =>
                (seen.wideTags?.includes(key) ?? false) === (wideTags?.includes(key) ?? false),
            ),
          )
        : {};
    if (Object.keys(kept).length !== Object.keys(own).length) setOwn(kept);
  }
  const isWide = (tag: string | null) => own[stackKey(tag)] ?? isStackWide(wideTags, tag);
  const toggle = (tag: string | null) =>
    setOwn((current) => ({ ...current, [stackKey(tag)]: !isWide(tag) }));
  return { isWide, toggle };
}

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

/**
 * The players' play space: the scene being played, its cover behind, and
 * its elements in the storyteller's stacks (playStacks), as read-only pills.
 * The info button beside the title opens the scene's description and notes
 * for the players to write up (SceneTextPopover). With no session, or a
 * session on no scene yet, it says which. What else it does is the
 * variant's (Variant).
 *
 * A picture the storyteller has put up from a pill's tack (the preview.open
 * pulse, held by the table as previewIdSceneElement) is open full size over
 * the space, in the same preview a thumbnail opens (PulsedPicture), until
 * the storyteller takes it down or the player closes it for themselves.
 *
 * At the players' table, the eye in the upper right puts away the title,
 * the stacks, the scene's overlay, the no-scene box and the cover's dimming,
 * leaving the cover alone until it is pressed again. The picture the
 * storyteller puts up stays: it is theirs to take down, not part of the
 * space.
 */
export function PlaySpace(props: Props) {
  const { idStory, scene } = props;
  const user = useUser();
  const atTable = props.variant === "table";
  const readOnly = !atTable;
  const withHistory = props.variant === "preview";
  const withTitle = props.variant !== "card";
  const withStateOverlay = props.variant !== "card";
  // Not for a guest: the eye's choice would be theirs alone, and the display
  // table is where a guest looks.
  const withBackgroundToggle = atTable && !user.isAnonymous;
  const [showBackground, setShowBackground] = useState(false);
  const detailsHidden = withBackgroundToggle && showBackground;
  const widths = useStackWidths(scene.scene?.idStoryScene ?? null, scene.wideTags);
  const note = atTable ? STATUS_NOTES[props.status] : undefined;
  const items = scene.items.map(toPlayItem);
  // A pending or complete scene is there to read, not to play in: the pills'
  // info and the scene's text open as they do on a preview, and nothing
  // writes, while the overlay says which it is.
  const held =
    scene.scene?.status === SCENE_PENDING_STATUS || scene.scene?.status === SCENE_LOCKED_STATUS;
  const lookOnly = readOnly || held;
  const coverUrl = scene.coverUrl ?? (atTable ? props.fallbackCoverUrl : null);
  const noSceneBox = atTable ? props.noSceneBox : undefined;
  const onTextChange = atTable ? props.onTextChange : () => {};
  const onNotesChange = atTable ? props.onNotesChange : () => {};
  const onStatusChange = atTable ? props.onStatusChange : () => {};

  return (
    <Box as="section" aria-labelledby="play-space-heading" position="relative" flex="1" minH="0">
      {coverUrl && (
        <CoverBackdrop
          url={coverUrl}
          scrim={detailsHidden ? "none" : "flat"}
          testId="play-space-cover"
        />
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
        {!withTitle && (
          <Heading id="play-space-heading" srOnly>
            Play space
          </Heading>
        )}
        {withTitle && (
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
                  {props.variant === "preview" && props.titleStart}
                  {props.variant === "preview" && props.renderTitle ? (
                    props.renderTitle(scene.scene.title, TITLE_PROPS)
                  ) : (
                    <Heading {...TITLE_PROPS}>{scene.scene.title}</Heading>
                  )}
                  <SceneTextPopover
                    idStory={idStory}
                    idStoryScene={scene.scene.idStoryScene}
                    title={scene.scene.title}
                    text={scene.scene.text}
                    saver="play"
                    onSaved={onTextChange}
                    readOnly={lookOnly}
                    icon="info"
                  />
                  {props.variant === "preview" && props.titleEnd}
                </HStack>
              </>
            )}
            {note && (
              <Badge variant="subtle" colorPalette="orange" flexShrink="0">
                {note}
              </Badge>
            )}
          </HStack>
        )}

        {scene.idStorySession === null && !readOnly ? (
          <Text color="fg.muted">No session is being played.</Text>
        ) : scene.scene === null ? (
          noSceneBox === undefined && (
            <Text color="fg.muted">The storyteller has not chosen a scene yet.</Text>
          )
        ) : (
          <Flex gap="3" wrap="wrap" align="flex-start" justify="space-between">
            {/* Each stack as the storyteller's table draws it (PlayStackFrame):
                the heading with its halo, the expand button that widens the
                stack to the whole space with its pills in columns, and the
                pills. Wide as the storyteller set it, or as the player has
                since (useStackWidths). */}
            {playStacks(scene.tags, items).map((stack) => {
              const wide = widths.isWide(stack.tag);
              return (
                <PlayStackFrame
                  key={stack.title}
                  title={stack.title}
                  size="table"
                  wide={wide}
                  controls={
                    <IconButtonWithTooltip
                      label={wide ? `Shrink ${stack.title}` : `Expand ${stack.title}`}
                      onClick={() => widths.toggle(stack.tag)}
                    >
                      {wide ? <Minimize2 /> : <Maximize2 />}
                    </IconButtonWithTooltip>
                  }
                  empty={
                    <Text fontSize="sm" color="fg.muted" textShadow={HALO}>
                      Nothing here yet.
                    </Text>
                  }
                  items={stack.items}
                  renderItem={(item) => (
                    <PlayPill
                      idStory={idStory}
                      idStoryScene={scene.scene!.idStoryScene}
                      item={item}
                      onNotesChange={onNotesChange}
                      onStatusChange={onStatusChange}
                      readOnly={lookOnly}
                      withHistory={withHistory}
                    />
                  )}
                />
              );
            })}
          </Flex>
        )}
      </Stack>
      {withStateOverlay && !detailsHidden && <SceneStateOverlay status={scene.scene?.status} />}
      {atTable && (
        <PulsedPicture
          items={items}
          idSceneElement={props.previewIdSceneElement}
          onClose={props.onPreviewClose}
        />
      )}
      {scene.scene === null && !detailsHidden && noSceneBox}
    </Box>
  );
}
