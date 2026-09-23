import { useId } from "react";
import { Avatar, Box, Container, Heading, HStack, List, Stack, Text } from "@chakra-ui/react";
import {
  cssUrlValue,
  formatLastPlayed,
  systemLabel,
  type StoryCardData,
  type StoryPlayer,
  type StorySession,
} from "@/lib/stories";
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
        >
          <Stack gap="2">
            <Heading as="h1" size="3xl">
              {story.gameTitle}
            </Heading>
            <Stack gap="0" color={story.imageUrl ? "whiteAlpha.800" : "fg.muted"}>
              {system && <Text>{system}</Text>}
              {story.storytellerName && <Text>Storyteller: {story.storytellerName}</Text>}
              <Text>Last played: {formatLastPlayed(story.lastPlayed)}</Text>
            </Stack>
            {story.summary && <Text pt="2">{story.summary}</Text>}
          </Stack>

          <Stack as="section" aria-labelledby={playersId} gap="4">
            <Heading id={playersId} size="xl">
              Players
            </Heading>
            {players.length === 0 ? (
              <Text color={story.imageUrl ? "whiteAlpha.800" : "fg.muted"}>No players yet.</Text>
            ) : (
              <List.Root listStyleType="none" gap="3">
                {players.map((player) => (
                  <List.Item key={player.idUser}>
                    <HStack gap="3">
                      <Avatar.Root size="sm">
                        <Avatar.Fallback name={player.name} />
                        {player.image && <Avatar.Image src={player.image} alt={player.name} />}
                      </Avatar.Root>
                      <Text>{player.name}</Text>
                    </HStack>
                  </List.Item>
                ))}
              </List.Root>
            )}
          </Stack>

          <Stack as="section" aria-labelledby={sessionsId} gap="4">
            <Heading id={sessionsId} size="xl">
              Recent sessions
            </Heading>
            <StorySessions idGame={story.idGame} initial={sessions} mutedColor={mutedColor} />
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
