"use client";

import { useId, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Portal,
  Stack,
  Text,
  Tooltip,
  chakra,
} from "@chakra-ui/react";
import { Layers, Maximize2, Minimize2 } from "lucide-react";
import { formatSceneLength } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import { cssUrlValue } from "@/lib/stories";
import type { StoryboardScene } from "@/lib/storyboard";
import { SceneElementsPanel } from "./scene-elements-panel";

type Props = {
  idStory: number;
  scene: StoryboardScene;
  /** The story_scenes workflow, for the status as a word on the card. */
  statusOptions: StatusOption[];
};

// The least height of the face: square at its usual width, and kept when
// the card is widened, so widening gives the scene's words longer lines,
// not a taller picture. A scene with more words than fit makes its card
// taller rather than cutting them short.
const FACE_HEIGHT = { base: "80vw", md: "24rem" } as const;

/**
 * One scene on the storyboard: the story card (stories/story-card.tsx) made
 * larger, with the scene's picture behind it and the same scrim and white
 * text over that. Under the title, which finished scene of its sitting
 * this was and how long it ran, for a scene that has been finished; the
 * status as a word for every scene, since on the storyteller's board a
 * scene may be anything.
 *
 * The whole description is on the face, however long: the board is for
 * reading the story where it is laid out, and a card that cut it short
 * would send the reader elsewhere for the rest. Touching the face opens
 * the card in place with the table's notes under the description, when
 * there are any and the viewer is given them, and a second touch closes
 * it. The title is the button for a keyboard and a screen reader; the rest
 * of the face toggles with it, so the card is a target and not just its
 * title. The card goes nowhere, for the same reason the description is
 * whole.
 *
 * The two buttons on the face do something else, so each stops the touch
 * before the face sees it. The Elements button in the bottom row grows the
 * card downwards with the scene as the players' table showed it
 * (SceneElementsPanel), and puts it away again; a panel under the card
 * rather than a dialog over the board, so the stacks are read beside the
 * scenes around them and two scenes' can be open at once. The expand
 * button in the top corner widens the card to most of the viewport and
 * back, for a scene with many stacks or a long description; the face
 * keeps its height either way.
 *
 * A fixed width rather than a share of a grid: the cards sit in a
 * side-to-side scroller, so each has to know its own size. Square at the
 * least rather than the story card's four by three: the board has the
 * height of the page to spend, and a taller card gives the scene's words
 * more lines.
 * Most of the viewport wide on a phone, where one card at a time is what
 * fits, so the expand button is for wider screens.
 */
export function SceneCard({ idStory, scene, statusOptions }: Props) {
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [showElements, setShowElements] = useState(false);
  const textId = useId();
  const panelId = useId();
  const article = useRef<HTMLDivElement>(null);
  const status = statusOptions.find((option) => option.key === scene.status)?.label ?? scene.status;
  const played =
    scene.sceneNumber === null
      ? null
      : `Scene ${scene.sceneNumber}` +
        (scene.length === null ? "" : ` · ${formatSceneLength(scene.length)}`);
  const size = wide ? `Shrink ${scene.title}` : `Expand ${scene.title}`;

  function toggleWide() {
    setWide(!wide);
    // A card most of the viewport wide that starts in the middle of it runs
    // off the right edge, its shrink button with it: bring its start to the
    // board's edge so the whole card is seen. Once it is laid out wide, so
    // the scroll lands on the widened card. (jsdom has no scrollIntoView.)
    if (!wide) {
      requestAnimationFrame(() => {
        article.current?.scrollIntoView?.({
          behavior: "smooth",
          block: "nearest",
          inline: "start",
        });
      });
    }
  }

  return (
    // The article holds the face and the panel, so a reader finds both
    // under the scene's name. alignSelf start so a lane's row or the
    // unplayed grid never stretches a card to its tallest neighbour.
    <Stack
      ref={article}
      as="article"
      aria-label={scene.title}
      gap="0"
      overflow="hidden"
      rounded="xl"
      w={{ base: "80vw", md: wide ? "80vw" : "24rem" }}
      flexShrink="0"
      alignSelf="start"
      _hover={{ boxShadow: "lg" }}
      transition="box-shadow 0.15s"
    >
      <Box
        position="relative"
        minH={FACE_HEIGHT}
        color="white"
        cursor="pointer"
        onClick={() => setOpen(!open)}
      >
        <Box
          data-testid="scene-cover"
          position="absolute"
          inset="0"
          bg="gray.700"
          bgSize="cover"
          bgPos="center"
          style={
            scene.imageUrl
              ? { backgroundImage: `url("${cssUrlValue(scene.imageUrl)}")` }
              : undefined
          }
        />
        {/* The story card's scrim, for the same reason: the title has to read
            on a bright picture and the bottom row on a dark one; deeper in
            the middle than the story card's, since the description runs
            through it. */}
        <Box
          position="absolute"
          inset="0"
          bgGradient="to-b"
          gradientFrom="blackAlpha.700"
          gradientVia="blackAlpha.600"
          gradientTo="blackAlpha.800"
        />

        <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
          <Tooltip.Trigger asChild>
            <IconButton
              type="button"
              aria-label={size}
              aria-pressed={wide}
              size="xs"
              variant="ghost"
              rounded="full"
              color="whiteAlpha.900"
              _hover={{ bg: "blackAlpha.500" }}
              position="absolute"
              top="3"
              right="3"
              zIndex="1"
              hideBelow="md"
              onClick={(event) => {
                event.stopPropagation();
                toggleWide();
              }}
            >
              {wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </IconButton>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content>{size}</Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>

        <Stack position="relative" minH={FACE_HEIGHT} p="4" gap="2">
          {/* Room at the end of the title for the expand button. */}
          <Stack gap="0" pe={{ md: "8" }}>
            <Text as="h3" textStyle="xl" fontWeight="semibold">
              <chakra.button
                type="button"
                aria-expanded={open}
                aria-controls={textId}
                textAlign="start"
                font="inherit"
                color="inherit"
                cursor="pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(!open);
                }}
              >
                {scene.title}
              </chakra.button>
            </Text>
            {played && (
              <Text textStyle="xs" color="whiteAlpha.800">
                {played}
              </Text>
            )}
          </Stack>

          {(scene.description || (open && scene.notes)) && (
            <Stack id={textId} gap="3" flex="1" minH="0">
              {scene.description && (
                <Text textStyle="sm" whiteSpace="pre-wrap" color="whiteAlpha.900">
                  {scene.description}
                </Text>
              )}
              {open && scene.notes && (
                <Stack gap="1">
                  <Heading size="xs" textTransform="uppercase" letterSpacing="wider">
                    Notes
                  </Heading>
                  <Text textStyle="sm" whiteSpace="pre-wrap" color="whiteAlpha.900">
                    {scene.notes}
                  </Text>
                </Stack>
              )}
            </Stack>
          )}

          <HStack justify="space-between" align="center" gap="2" mt="auto">
            <Badge size="sm" variant="solid" colorPalette="gray">
              {status}
            </Badge>
            <Button
              type="button"
              aria-expanded={showElements}
              aria-controls={showElements ? panelId : undefined}
              size="sm"
              rounded="full"
              bg={showElements ? "whiteAlpha.900" : "blackAlpha.500"}
              color={showElements ? "gray.900" : "whiteAlpha.900"}
              _hover={{ bg: showElements ? "white" : "blackAlpha.700" }}
              position="relative"
              zIndex="1"
              onClick={(event) => {
                event.stopPropagation();
                setShowElements(!showElements);
              }}
            >
              <Layers size={16} />
              Elements
            </Button>
          </HStack>
        </Stack>
      </Box>

      {showElements && (
        <SceneElementsPanel
          id={panelId}
          idStory={idStory}
          idStoryScene={scene.idStoryScene}
          title={scene.title}
        />
      )}
    </Stack>
  );
}
