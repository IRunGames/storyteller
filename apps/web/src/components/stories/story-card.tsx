"use client";

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
import {
  SUMMARY_PREVIEW_CHARS,
  cssUrlValue,
  systemLabel,
  type StoryCardData,
} from "@/lib/stories";
import { BookOpen, Heart } from "lucide-react";
import { LocalDate } from "@/components/dates/local-date";
import { PlayerCount } from "./player-count";
import { StoryPlayButton } from "./story-play-button";
import { StoryPlayPopover } from "./story-play-popover";

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

  // Players in the waiting room, as the storyteller sees them: on Play, and
  // as the outline round the card. Only the owner's card shows it, because
  // Play is theirs, and an outline a player could not account for would only
  // puzzle them. An inactive story has no Play to put the count on.
  const waiting = story.isOwner && story.isActive ? story.waitingCount : 0;
  const waitingText = `${waiting} ${waiting === 1 ? "player" : "players"} waiting`;

  return (
    <LinkBox
      as="article"
      aria-label={story.title}
      position="relative"
      overflow="hidden"
      rounded="xl"
      aspectRatio={{ base: 3 / 4, md: 4 / 3 }}
      color="white"
      _hover={{ boxShadow: "lg" }}
      transition="box-shadow 0.15s"
      data-waiting={waiting > 0 ? "" : undefined}
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
              <NextLink href={`/stories/${story.idStory}`}>{story.title}</NextLink>
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

        {/* Bottom row: on the left an Inactive pill for a retired story,
            else Play for everyone (StoryPlayButton), with the Library button
            beside either for the owner; the player count in the middle; the
            date on the right. A grid with equal outer
            columns keeps the count centred whatever the sides hold, and
            justifyItems start stops the round Play button being stretched to
            its column's width. In the flow rather than floated like the
            heart, so it can never fall outside the card. The buttons sit
            above the LinkOverlay's ::before so the click is their own, like
            "more". */}
        <Grid
          templateColumns="1fr auto 1fr"
          alignItems="center"
          justifyItems="start"
          gap="2"
          mt="auto"
        >
          {/* The storyteller's Library button rides beside whatever sits
              here, the Inactive pill included: the story page offers it
              whatever the story's state, and a retired story's library is
              still worth opening. */}
          <HStack gap="1">
            {!story.isActive ? (
              <Badge size="sm" variant="solid" colorPalette="gray">
                Inactive
              </Badge>
            ) : story.isOwner ? (
              // The storyteller chooses the session first; see the popover.
              <StoryPlayPopover
                idStory={story.idStory}
                title={story.title}
                count={waiting > 0 ? waiting : null}
                label={waiting > 0 ? `Play, ${waitingText}` : "Play"}
                tooltip={waiting > 0 ? `Start playing · ${waiting} waiting` : "Start playing"}
              />
            ) : (
              // A player's Play is there whether or not a session is on, and
              // is highlighted when there is someone to join: the players at
              // the table while a session is on, or the others already
              // waiting for one. Plain only when it would be an empty room.
              <StoryPlayButton
                idStory={story.idStory}
                {...playerPlay(story)}
              />
            )}
            {story.isOwner && (
              <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
                <Tooltip.Trigger asChild>
                  {/* The story page's own Library button, the book, in the
                      white-over-cover dressing it wears there. */}
                  <IconButton
                    asChild
                    aria-label="Library: prep game"
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
                    <NextLink href={`/libraries/${story.idStory}`}>
                      <BookOpen size={18} />
                    </NextLink>
                  </IconButton>
                </Tooltip.Trigger>
                <Portal>
                  <Tooltip.Positioner>
                    <Tooltip.Content>Library: prep game</Tooltip.Content>
                  </Tooltip.Positioner>
                </Portal>
              </Tooltip.Root>
            )}
          </HStack>
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

// What a player's Play shows: the count it is highlighted with, or null for
// the plain button, with the name and tooltip that say what the count is.
function playerPlay(story: StoryCardData): { count: number | null; label: string; tooltip: string } {
  if (story.hasOpenSession) {
    const n = story.presentCount;
    return {
      count: n,
      label: `Play, ${n} ${n === 1 ? "player" : "players"} at the table`,
      tooltip: `Session in progress · ${n} at the table`,
    };
  }
  if (story.waitingCount > 0) {
    const n = story.waitingCount;
    return {
      count: n,
      label: `Play, ${n} ${n === 1 ? "player" : "players"} waiting`,
      tooltip: `${n} waiting for the storyteller`,
    };
  }
  return { count: null, label: "Play", tooltip: "Go to the table" };
}
