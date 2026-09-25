import { useId } from "react";
import NextLink from "next/link";
import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  IconButton,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Pencil, Play, Timer } from "lucide-react";
import {
  cssUrlValue,
  formatLastPlayed,
  systemLabel,
  type StoryCardData,
  type StoryPlayer,
  type StorySession,
} from "@/lib/stories";
import { StoryPlayers } from "./story-players";
import { StorySessions } from "./story-sessions";

type Props = {
  story: StoryCardData;
  players: StoryPlayer[];
  /** The first page of the story's sessions; StorySessions fetches the rest. */
  sessions: StorySession[];
};

// The story page's body: the cover as a full-bleed backdrop when there is one,
// and the text in a dark panel over it. No hooks beyond useId, so the page can
// render it on the server. Presentational only; stories/[id]/page.tsx loads
// the data.
export function StoryDetails({ story, players, sessions }: Props) {
  const playersId = useId();
  const sessionsId = useId();
  const system = systemLabel(story);
  // Secondary text sits on the dark panel when there is a cover, and on the
  // plain page otherwise.
  const mutedColor = story.imageUrl ? "whiteAlpha.800" : "fg.muted";

  return (
    // flex="1" fills the nav layout's column so the backdrop reaches the foot
    // of the viewport, not just the bottom of the text.
    <Box position="relative" flex="1">
      {story.imageUrl && (
        <>
          <Box
            data-testid="story-backdrop"
            position="absolute"
            inset="0"
            bgSize="cover"
            bgPos="center"
            style={{ backgroundImage: `url("${cssUrlValue(story.imageUrl)}")` }}
          />
          {/* The cards' scrim, so the panel edges never meet a bright cover
              directly and the page reads the same in every theme. */}
          <Box
            position="absolute"
            inset="0"
            bgGradient="to-b"
            gradientFrom="blackAlpha.700"
            gradientVia="blackAlpha.400"
            gradientTo="blackAlpha.800"
          />
        </>
      )}

      <Container maxW="3xl" py="8" position="relative">
        {/* One panel for everything, heading included. Opaque without a cover
            would be a box on a plain page for no reason, so the panel only
            draws itself when there is an image to stand out from. */}
        <Stack
          gap="10"
          p={story.imageUrl ? { base: "5", md: "8" } : undefined}
          rounded="xl"
          bg={story.imageUrl ? "blackAlpha.700" : undefined}
          color={story.imageUrl ? "white" : undefined}
          position="relative"
        >
          {story.isOwner && (
            // Only the storyteller edits a story, and the button sits in the
            // panel's top right corner, clear of the title, rather than in
            // the text flow. A link styled as a button: the edit page is a
            // page of its own, so the back button returns here.
            <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
              <Tooltip.Trigger asChild>
                <IconButton
                  asChild
                  aria-label="Edit story"
                  variant="ghost"
                  size="sm"
                  rounded="full"
                  position="absolute"
                  top={story.imageUrl ? { base: "3", md: "5" } : "0"}
                  right={story.imageUrl ? { base: "3", md: "5" } : "0"}
                  color={story.imageUrl ? "whiteAlpha.900" : undefined}
                  _hover={story.imageUrl ? { bg: "whiteAlpha.200" } : undefined}
                >
                  <NextLink href={`/stories/${story.idStory}/edit`}>
                    <Pencil size={18} />
                  </NextLink>
                </IconButton>
              </Tooltip.Trigger>
              <Portal>
                <Tooltip.Positioner>
                  <Tooltip.Content>Edit story</Tooltip.Content>
                </Tooltip.Positioner>
              </Portal>
            </Tooltip.Root>
          )}

          <Stack gap="2">
            <HStack gap="3" align="center">
              <Heading as="h1" size="3xl">
                {story.title}
              </Heading>
              {story.isOwner && (
                // Prep Work is the storyteller's library for the story: its
                // scenes and enemies are what the players are not meant to
                // see yet, so the door to it is theirs alone, like Edit. A
                // link styled as a button, since the library is a page of its
                // own.
                <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
                  <Tooltip.Trigger asChild>
                    <IconButton
                      asChild
                      aria-label="Prep Work"
                      variant="ghost"
                      size="lg"
                      rounded="full"
                      color={story.imageUrl ? "whiteAlpha.900" : undefined}
                      _hover={story.imageUrl ? { bg: "whiteAlpha.200" } : undefined}
                    >
                      <NextLink href={`/libraries/${story.idStory}`}>
                        <Timer size={24} />
                      </NextLink>
                    </IconButton>
                  </Tooltip.Trigger>
                  <Portal>
                    <Tooltip.Positioner>
                      <Tooltip.Content>Prep Work</Tooltip.Content>
                    </Tooltip.Positioner>
                  </Portal>
                </Tooltip.Root>
              )}
            </HStack>
            <Stack gap="0" color={story.imageUrl ? "whiteAlpha.800" : "fg.muted"}>
              {system && <Text>{system}</Text>}
              {story.storytellerName && <Text>Storyteller: {story.storytellerName}</Text>}
              <Text>Last played: {formatLastPlayed(story.lastPlayed)}</Text>
            </Stack>
            {story.summary && <Text pt="2">{story.summary}</Text>}
          </Stack>

          <Stack as="section" aria-labelledby={playersId} gap="4">
            <StoryPlayers
              idStory={story.idStory}
              headingId={playersId}
              initial={players}
              isOwner={story.isOwner}
              mutedColor={mutedColor}
            />
          </Stack>

          <Stack as="section" aria-labelledby={sessionsId} gap="4">
            <HStack justify="space-between" gap="4">
              <Heading id={sessionsId} size="xl">
                Recent sessions
              </Heading>
              {story.isOwner && story.isActive && (
                // The card's Play button, with its label spelled out since
                // there is room here, and under the same rule: only the
                // storyteller opens the table, and not for a retired story.
                <Button asChild size="sm" rounded="full">
                  <NextLink href={`/play/${story.idStory}`}>
                    <Play size={16} />
                    Play now
                  </NextLink>
                </Button>
              )}
            </HStack>
            <StorySessions idStory={story.idStory} initial={sessions} mutedColor={mutedColor} />
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
