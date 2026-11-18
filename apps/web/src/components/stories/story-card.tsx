"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import {
  Badge,
  Box,
  Button,
  Grid,
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
import { SUMMARY_PREVIEW_CHARS, systemLabel, type StoryCardData } from "@/lib/stories";
import { storyboardPath } from "@/lib/storyboard";
import { GalleryHorizontalEnd } from "lucide-react";
import { LocalDate } from "@/components/dates/local-date";
import { PlayerCount } from "./player-count";
import { StoryFavoriteButton } from "./story-favorite-button";
import { PlayButton } from "./story-play-button";
import { StoryTitleMenu } from "./story-title-menu";
import { CoverBackdrop } from "@/components/covers/cover-backdrop";

type Props = {
  story: StoryCardData;
  /** Called with the story and the state the user asked for. Omit to hide the heart. */
  onToggleFavorite?: (story: StoryCardData, isFavorite: boolean) => void;
  /** True while a toggle for this story is in flight; the heart is disabled. */
  favoritePending?: boolean;
};

// One story on the Stories page. The whole card links to the story; the
// title, which opens the story's doors as a menu (StoryTitleMenu), the
// "more" link and the heart are the things inside it that do something
// else, so they sit above the LinkOverlay or stop the click before it sees it.
export function StoryCard({ story, onToggleFavorite, favoritePending = false }: Props) {
  const system = systemLabel(story);
  const summary = story.summary ?? "";
  const isLong = summary.length > SUMMARY_PREVIEW_CHARS;

  // One string for the accessible name and the tooltip, so they never drift.

  // Players in the waiting room, as the storyteller sees them: as the
  // outline round the card (Play counts them itself; see PlayButton). Only
  // the owner's card shows it, because an outline a player could not account
  // for would only puzzle them. An inactive story has no table to wait at.
  const waiting = story.isOwner && story.isActive ? story.waitingCount : 0;
  // A session is being played at the table: the card glows, for the
  // storyteller and the players alike, so a story in play stands out on the
  // home page and the stories page without anyone reading the counts. A
  // retired story has no table, so none.
  const live = story.hasOpenSession && story.isActive;
  // In the theme's highlight, as the waiting outline is; wider on hover,
  // where every other card takes a shadow.
  const glow = (spread: number) =>
    `0 0 ${spread * 6}px ${spread}px var(--chakra-colors-play-accent)`;

  return (
    <LinkBox
      as="article"
      aria-label={story.title}
      position="relative"
      overflow="hidden"
      rounded="xl"
      aspectRatio={{ base: 5 / 3, md: 4 / 3 }}
      color="white"
      boxShadow={live ? glow(3) : undefined}
      _hover={{ boxShadow: live ? glow(5) : "lg" }}
      transition="box-shadow 0.15s"
      data-waiting={waiting > 0 ? "" : undefined}
      data-live={live ? "" : undefined}
    >
      {/* The highlight round a card with players waiting. A layer of its own
          above everything else rather than the card's border or outline:
          a border takes room, so the card would shrink beside its
          neighbours, and Chrome paints the positioned cover, scrim and
          heart over an outline drawn inside the card. pointerEvents none so
          every click still lands on what is underneath. */}
      {waiting > 0 && (
        <Box
          aria-hidden
          position="absolute"
          inset="0"
          zIndex="2"
          rounded="xl"
          borderWidth="3px"
          borderColor="play.accent"
          pointerEvents="none"
        />
      )}
      {/* Deeper in the middle than the pages' scrim: the summary is white
          text and runs through it, and a pale cover would wash it out. */}
      <CoverBackdrop
        url={story.imageUrl}
        scrim="deep-gradient"
        fallback="gray.700"
        testId="story-cover"
      />

      <Stack position="relative" h="full" p="4" gap="2">
        {/* Room on the right for the heart, which floats over this corner. */}
        <Stack gap="0" pr="12">
          {/* The card's own link to the story, named for it; its ::before
              covers the card, under the title menu and the buttons. */}
          <LinkOverlay asChild>
            <NextLink href={`/stories/${story.idStory}`} aria-label={`Open ${story.title}`} />
          </LinkOverlay>
          {/* The title's line, with the Storyboard door at its right for
              everyone: the board shows each reader what they may see of the
              story's scenes. The title keeps minW 0 so a long one wraps
              rather than pushing the door out. */}
          <HStack gap="1" alignItems="center">
            <Box position="relative" zIndex="1" minW="0">
              <StoryTitleMenu
                idStory={story.idStory}
                title={story.title}
                isStoryteller={story.isOwner}
                as="h3"
                size="md"
                fontWeight="semibold"
                onImage
              />
            </Box>
            <Door label="Storyboard" href={storyboardPath(story.idStory)}>
              <GalleryHorizontalEnd size={18} />
            </Door>
          </HStack>
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

        {/* A phone's card is 5:3, which leaves room under the title for two
            lines of summary and nothing more: a third, or "more" under
            them, would run into the bottom row. The card itself opens the
            story, where the whole summary is. */}
        {summary && (
          <Box flex="1" minH="0">
            <Text textStyle="sm" lineClamp={{ base: 2, md: 3 }} color="whiteAlpha.900">
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
                    hideBelow="md"
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

        {/* Bottom row: on the left an Inactive pill for a retired story,
            else Play for everyone (PlayButton); the player count in the
            middle; the date on the right. A grid with equal outer columns
            keeps the count centred whatever the sides hold, and justifyItems
            start stops the round Play button being stretched to its column's
            width. In the flow rather than floated like the heart, so it can
            never fall outside the card. The button sits above the
            LinkOverlay's ::before so the click is its own, like "more". */}
        <Grid
          templateColumns="1fr auto 1fr"
          alignItems="center"
          justifyItems="start"
          gap="2"
          mt="auto"
        >
          {!story.isActive ? (
            <Badge size="sm" variant="solid" colorPalette="gray">
              Inactive
            </Badge>
          ) : (
            // Play, as everywhere: the storyteller's opens the session
            // popover, a player's goes to the table.
            <PlayButton story={story} />
          )}
          {/* The card's own dressing over the cover: a dark pill so the
              count reads against whatever the image is doing under it. */}
          <PlayerCount
            count={story.playerCount}
            px="2"
            py="0.5"
            rounded="full"
            bg="blackAlpha.500"
            fontWeight="semibold"
            color="whiteAlpha.900"
            justifySelf="center"
            position="relative"
            zIndex="1"
          />
          <Text textStyle="xs" color="whiteAlpha.800" justifySelf="end">
            <LocalDate value={story.lastPlayed} />
          </Text>
        </Grid>
      </Stack>

      {onToggleFavorite && (
        // Last in the DOM so a screen reader reaches the title first, and
        // positioned above the LinkOverlay's ::before (z-index 0) so the click
        // is the button's and never the card link's — same technique as "more".
        <StoryFavoriteButton
          idStory={story.idStory}
          isFavorite={story.isFavorite}
          onImage
          pending={favoritePending}
          onToggle={(isFavorite) => onToggleFavorite(story, isFavorite)}
          position="absolute"
          top="2"
          right="2"
          zIndex="1"
        />
      )}
    </LinkBox>
  );
}

// One of the story page's doors on the card: a link styled as the page's
// own round icon button, in the white-over-cover dressing it wears there,
// with the label as its name and its tooltip. Above the LinkOverlay's
// ::before, and stopping the click, so it is the door's and never the
// card's.
function Door({ label, href, children }: { label: string; href: string; children: ReactNode }) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          asChild
          aria-label={label}
          variant="ghost"
          size="sm"
          rounded="full"
          color="whiteAlpha.900"
          _hover={{ bg: "whiteAlpha.200" }}
          position="relative"
          zIndex="1"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <NextLink href={href}>{children}</NextLink>
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
