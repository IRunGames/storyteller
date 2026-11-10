import { useId, type ReactNode } from "react";
import NextLink from "next/link";
import {
  Badge,
  Box,
  Heading,
  HStack,
  IconButton,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { BookOpen, GalleryHorizontalEnd, Pencil } from "lucide-react";
import {
  cssUrlValue,
  systemLabel,
  type StoryCardData,
  type StoryPlayer,
  type StorySession,
} from "@/lib/stories";
import { storyboardPath } from "@/lib/storyboard";
import { LocalDate } from "@/components/dates/local-date";
import { StoryAttachments } from "./story-attachments";
import { StoryBuildScenesDoor } from "./story-build-scenes-door";
import { StoryFavoriteButton } from "./story-favorite-button";
import { StoryPanel } from "./story-panel";
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
// and the text in a dark panel over it (StoryPanel, which also holds the
// column's width). No hooks beyond useId, so the page can render it on the
// server. Presentational only; stories/[id]/page.tsx loads the data.
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

      <StoryPanel
        onImage={!!story.imageUrl}
        // The card's heart, at the end of the title's line.
        corner={
          <StoryFavoriteButton
            idStory={story.idStory}
            isFavorite={story.isFavorite}
            onImage={!!story.imageUrl}
          />
        }
        doors={
          // The storyteller's doors, across from the game system under the
          // title: the library, where the game is prepped (its scenes are
          // what the players are not meant to see yet, so it is theirs
          // alone), Build Scenes (StoryBuildScenesDoor) and the edit page.
          // Links styled as buttons: each is a page of its own, so the back
          // button returns here. The storyboard, which everyone may read,
          // sits beside the title instead.
          story.isOwner && (
            <>
              <Door
                label="Library: Full Story Resources"
                href={`/libraries/${story.idStory}`}
                onImage={!!story.imageUrl}
              >
                <BookOpen size={18} />
              </Door>
              <StoryBuildScenesDoor
                idStory={story.idStory}
                buildSceneId={buildSceneId}
                onImage={!!story.imageUrl}
              />
              <Door
                label="Edit story"
                href={`/stories/${story.idStory}/edit`}
                onImage={!!story.imageUrl}
              >
                <Pencil size={18} />
              </Door>
            </>
          )
        }
        // The title's line: the title, then a little apart from it the door
        // to the storyboard, which shows each reader what the sessions below
        // would, and the PUBLIC badge, both about the whole story. The heart
        // and the expand button end the line (StoryPanel).
        heading={
          <HStack gap="2" align="center" wrap="wrap" minW="0">
            <Heading as="h1" size="3xl">
              {story.title}
            </Heading>
            <Box ms="2">
              <Door
                label="Storyboard"
                href={storyboardPath(story.idStory)}
                onImage={!!story.imageUrl}
              >
                <GalleryHorizontalEnd size={18} />
              </Door>
            </Box>
            {story.isPublic && (
              // Anyone signed in may read the story's sessions: said
              // beside the title, since it is a fact about the whole
              // story and not about any one section of the page.
              <Badge variant="solid" colorPalette="blue" flexShrink="0">
                PUBLIC
              </Badge>
            )}
          </HStack>
        }
        details={
          <Stack gap="2">
            <Stack gap="0" color={story.imageUrl ? "whiteAlpha.800" : "fg.muted"}>
              {system && <Text>{system}</Text>}
              {story.storytellerName && <Text>Storyteller: {story.storytellerName}</Text>}
              <Text>
                Last played: <LocalDate value={story.lastPlayed} />
              </Text>
            </Stack>
            {story.summary && <Text pt="2">{story.summary}</Text>}
          </Stack>
        }
      >
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
      </StoryPanel>
    </Box>
  );
}

/**
 * One of the page's doors: a link styled as an icon button, with the tooltip
 * every icon button carries, coloured for the dark panel over a cover.
 */
function Door({
  label,
  href,
  onImage,
  children,
}: {
  label: string;
  href: string;
  onImage: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          asChild
          aria-label={label}
          variant="ghost"
          size="sm"
          rounded="full"
          flexShrink="0"
          color={onImage ? "whiteAlpha.900" : undefined}
          _hover={onImage ? { bg: "whiteAlpha.200" } : undefined}
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
