"use client";

import NextLink from "next/link";
import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  LinkBox,
  LinkOverlay,
  Popover,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import {
  SUMMARY_PREVIEW_CHARS,
  cssUrlValue,
  formatLastPlayed,
  systemLabel,
  type StoryCardData,
} from "@/lib/stories";
import { Heart, Play } from "lucide-react";

type Props = {
  story: StoryCardData;
  /** Called with the story and the state the user asked for. Omit to hide the heart. */
  onToggleFavorite?: (story: StoryCardData, isFavorite: boolean) => void;
  /** True while a toggle for this story is in flight; the heart is disabled. */
  favoritePending?: boolean;
};

// One story on the Stories page. The whole card links to the story; the
// "more" link and the heart are the two things inside it that do something
// else, so they stop the click before LinkOverlay sees it.
export function StoryCard({ story, onToggleFavorite, favoritePending = false }: Props) {
  const system = systemLabel(story);
  const summary = story.summary ?? "";
  const isLong = summary.length > SUMMARY_PREVIEW_CHARS;

  // One string for the accessible name and the tooltip, so they never drift.
  const favoriteLabel = story.isFavorite ? "Remove from Favorites" : "Add to Favorites";

  return (
    <LinkBox
      as="article"
      aria-label={story.gameTitle}
      position="relative"
      overflow="hidden"
      rounded="xl"
      aspectRatio={{ base: 3 / 4, md: 4 / 3 }}
      color="white"
      _hover={{ boxShadow: "lg" }}
      transition="box-shadow 0.15s"
    >
      <Box
        data-testid="story-cover"
        position="absolute"
        inset="0"
        bg="gray.700"
        bgSize="cover"
        bgPos="center"
        style={
          story.imageUrl
            ? { backgroundImage: `url("${cssUrlValue(story.imageUrl)}")` }
            : undefined
        }
      />
      {/* Scrim: dark at the bottom for the date, lighter but present at the top
          so the title reads on a bright cover. */}
      <Box
        position="absolute"
        inset="0"
        bgGradient="to-b"
        gradientFrom="blackAlpha.700"
        gradientVia="blackAlpha.400"
        gradientTo="blackAlpha.800"
      />

      <Stack position="relative" h="full" p="4" gap="2">
        {/* Room on the right for the heart, which floats over this corner. */}
        <Stack gap="0" pr="12">
          <Text as="h3" textStyle="lg" fontWeight="semibold" lineClamp={2}>
            <LinkOverlay asChild>
              <NextLink href={`/stories/${story.idGame}`}>{story.gameTitle}</NextLink>
            </LinkOverlay>
          </Text>
          {system && (
            <Text textStyle="xs" color="whiteAlpha.800">
              {system}
            </Text>
          )}
          {!story.isOwner && story.storytellerName && (
            <Text textStyle="xs" color="whiteAlpha.800">
              Storyteller: {story.storytellerName}
            </Text>
          )}
        </Stack>

        {summary && (
          <Box flex="1" minH="0">
            <Text textStyle="sm" lineClamp={3} color="whiteAlpha.900">
              {summary}
            </Text>
            {isLong && (
              <Popover.Root positioning={{ placement: "bottom" }}>
                <Popover.Trigger asChild>
                  <Button
                    type="button"
                    size="xs"
                    variant="plain"
                    color="whiteAlpha.900"
                    textDecoration="underline"
                    px="0"
                    h="auto"
                    position="relative"
                    zIndex="1"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    more
                  </Button>
                </Popover.Trigger>
                <Portal>
                  <Popover.Positioner>
                    <Popover.Content maxW="sm">
                      <Popover.Arrow />
                      <Popover.Body>
                        <Text textStyle="sm">{summary}</Text>
                      </Popover.Body>
                    </Popover.Content>
                  </Popover.Positioner>
                </Portal>
              </Popover.Root>
            )}
          </Box>
        )}

        {/* Bottom row: on the left an Inactive pill for a retired story, else
            the owner's Play button, else nothing; the date on the right. In
            the flow rather than floated like the heart, so it can never fall
            outside the card. The button sits above the LinkOverlay's ::before
            so the click is its own, like "more". */}
        <HStack justify="space-between" align="center" mt="auto">
          {!story.isActive ? (
            <Badge size="sm" variant="solid" colorPalette="gray">
              Inactive
            </Badge>
          ) : story.isOwner ? (
            <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
              <Tooltip.Trigger asChild>
                <IconButton
                  asChild
                  aria-label="Play"
                  size="sm"
                  rounded="full"
                  position="relative"
                  zIndex="1"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <NextLink href={`/play/${story.idGame}`}>
                    <Play size={18} />
                  </NextLink>
                </IconButton>
              </Tooltip.Trigger>
              <Portal>
                <Tooltip.Positioner>
                  <Tooltip.Content>Start playing</Tooltip.Content>
                </Tooltip.Positioner>
              </Portal>
            </Tooltip.Root>
          ) : (
            <Box />
          )}
          <Text textStyle="xs" color="whiteAlpha.800">
            {formatLastPlayed(story.lastPlayed)}
          </Text>
        </HStack>
      </Stack>

      {onToggleFavorite && (
        // Last in the DOM so a screen reader reaches the title first, and
        // positioned above the LinkOverlay's ::before (z-index 0) so the click
        // is the button's and never the card link's — same technique as "more".
        //
        // aria-disabled rather than disabled: a disabled button drops out of
        // the tab order, so a keyboard user loses their place mid-toggle. The
        // click handler enforces it instead.
        <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
          <Tooltip.Trigger asChild>
        <IconButton
          type="button"
          aria-label={favoriteLabel}
          aria-pressed={story.isFavorite}
          variant="ghost"
          size="sm"
          rounded="full"
          position="absolute"
          top="2"
          right="2"
          zIndex="1"
          color={story.isFavorite ? "red.300" : "whiteAlpha.900"}
          bg="blackAlpha.400"
          _hover={{ bg: "blackAlpha.600" }}
          aria-disabled={favoritePending}
          opacity={favoritePending ? "0.6" : undefined}
          cursor={favoritePending ? "not-allowed" : undefined}
          onClick={(event) => {
            event.stopPropagation();
            if (favoritePending) return;
            onToggleFavorite(story, !story.isFavorite);
          }}
        >
          <Heart size={22} fill={story.isFavorite ? "currentColor" : "none"} />
        </IconButton>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content>{favoriteLabel}</Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      )}
    </LinkBox>
  );
}
