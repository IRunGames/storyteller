import { useId } from "react";
import NextLink from "next/link";
import {
  Badge,
  Box,
  Container,
  Heading,
  HStack,
  IconButton,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { BookOpen, Clapperboard, Pencil } from "lucide-react";
import {
  cssUrlValue,
  systemLabel,
  type StoryCardData,
  type StoryPlayer,
  type StorySession,
} from "@/lib/stories";
import { LocalDate } from "@/components/dates/local-date";
import { StoryAttachments } from "./story-attachments";
import { StoryPlayers } from "./story-players";
import { PlayButton } from "./story-play-button";
import type { StatusOption } from "@/lib/status";
import { StorySessions } from "./story-sessions";

type Props = {
  story: StoryCardData;
  players: StoryPlayer[];
  /** The first page of the story's sessions; StorySessions fetches the rest. */
  sessions: StorySession[];
  /** The story_sessions workflow, for the status pill on each row. */
  sessionStatusOptions: StatusOption[];
  /**
   * The scene the storyteller's Build Scenes door opens, or null for the
   * library when the story has none (sa_getSceneToBuild). Only read for
   * the storyteller, who alone has the door.
   */
  buildSceneId?: number | null;
};

// The story page's body: the cover as a full-bleed backdrop when there is one,
// and the text in a dark panel over it. No hooks beyond useId, so the page can
// render it on the server. Presentational only; stories/[id]/page.tsx loads
// the data.
export function StoryDetails({
  story,
  players,
  sessions,
  sessionStatusOptions,
  buildSceneId = null,
}: Props) {
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
            // The storyteller's two doors, in the panel's top right corner,
            // clear of the title rather than in the text flow: the library,
            // where the game is prepped (its scenes are what the players are
            // not meant to see yet, so it is theirs alone), and the edit
            // page. Links styled as buttons: each is a page of its own, so
            // the back button returns here.
            <HStack
              gap="1"
              position="absolute"
              top={story.imageUrl ? { base: "3", md: "5" } : "0"}
              right={story.imageUrl ? { base: "3", md: "5" } : "0"}
            >
              {(
                [
                  {
                    label: "Library: Full Story Resources",
                    href: `/libraries/${story.idStory}`,
                    icon: <BookOpen size={18} />,
                  },
                  {
                    // The live-edit page of the scene the storyteller
                    // touched last, as the library's scene cards open one;
                    // the library itself while the story has no scenes.
                    label: "Build Scenes",
                    href:
                      buildSceneId === null
                        ? `/libraries/${story.idStory}`
                        : `/scenes/${buildSceneId}/live`,
                    icon: <Clapperboard size={18} />,
                  },
                  {
                    label: "Edit story",
                    href: `/stories/${story.idStory}/edit`,
                    icon: <Pencil size={18} />,
                  },
                ] as const
              ).map((door) => (
                <Tooltip.Root key={door.label} openDelay={200} positioning={{ placement: "top" }}>
                  <Tooltip.Trigger asChild>
                    <IconButton
                      asChild
                      aria-label={door.label}
                      variant="ghost"
                      size="sm"
                      rounded="full"
                      color={story.imageUrl ? "whiteAlpha.900" : undefined}
                      _hover={story.imageUrl ? { bg: "whiteAlpha.200" } : undefined}
                    >
                      <NextLink href={door.href}>{door.icon}</NextLink>
                    </IconButton>
                  </Tooltip.Trigger>
                  <Portal>
                    <Tooltip.Positioner>
                      <Tooltip.Content>{door.label}</Tooltip.Content>
                    </Tooltip.Positioner>
                  </Portal>
                </Tooltip.Root>
              ))}
            </HStack>
          )}

          <Stack gap="2">
            {/* Room on the right for the three doors above, which float
                over this corner. */}
            <HStack gap="3" align="center" pr={story.isOwner ? "28" : undefined}>
              <Heading as="h1" size="3xl">
                {story.title}
              </Heading>
              {story.isPublic && (
                // Anyone signed in may read the story's sessions: said
                // beside the title, since it is a fact about the whole
                // story and not about any one section of the page.
                <Badge variant="solid" colorPalette="blue" flexShrink="0">
                  PUBLIC
                </Badge>
              )}
            </HStack>
            <Stack gap="0" color={story.imageUrl ? "whiteAlpha.800" : "fg.muted"}>
              {system && <Text>{system}</Text>}
              {story.storytellerName && <Text>Storyteller: {story.storytellerName}</Text>}
              <Text>
                Last played: <LocalDate value={story.lastPlayed} />
              </Text>
            </Stack>
            {story.summary && <Text pt="2">{story.summary}</Text>}
          </Stack>

          <Stack as="section" aria-labelledby={playersId} gap="4">
            <StoryPlayers
              idStory={story.idStory}
              headingId={playersId}
              initial={players}
              isOwner={story.isOwner}
              isOpenToJoin={story.isLookingForPlayers && story.isActive}
              mutedColor={mutedColor}
            />
          </Stack>

          <Stack as="section" aria-labelledby={sessionsId} gap="4">
            <HStack justify="space-between" gap="4">
              <Heading id={sessionsId} size="xl">
                Recent sessions
              </Heading>
              {(story.isOwner || story.isPlayer) && story.isActive && (
                // The card's Play, for the storyteller and the story's
                // players, and not for a retired story. The storyteller's
                // opens the session popover, which asks which session
                // first, so the table never opens with none; a player's is
                // the link to the table. Someone only reading the page has
                // no table to go to.
                <PlayButton story={story} />
              )}
            </HStack>
            {/* The same row the Prep Work timeline draws: the session's
                number and title, who was at the table, how long it ran and
                a status pill the storyteller can move. */}
            <StorySessions
              idStory={story.idStory}
              initial={sessions}
              mutedColor={mutedColor}
              showPlayers
              statusOptions={sessionStatusOptions}
              canEditStatus={story.isOwner}
              showTitles
            />
          </Stack>

          {story.isOwner && (
            // The one place a story's pictures are added or removed: the New
            // story form has no story to attach them to yet, so creating one
            // lands here instead. The field loads and attaches its own rows
            // against the story's id, so nothing is handed back to the page.
            // The storyteller's alone, as Edit is: sa_createAttachment refuses
            // anyone else.
            <StoryAttachments idStory={story.idStory} onImage={!!story.imageUrl} />
          )}
        </Stack>
      </Container>
    </Box>
  );
}
