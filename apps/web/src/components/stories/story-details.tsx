import { useId } from "react";
import { Badge, Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import {
  cssUrlValue,
  systemLabel,
  type StoryCardData,
  type StoryPlayer,
  type StorySession,
} from "@/lib/stories";
import { LocalDate } from "@/components/dates/local-date";
import { StoryAttachments } from "./story-attachments";
import { StoryFavoriteButton } from "./story-favorite-button";
import { StoryPanel } from "./story-panel";
import { StoryPlayers } from "./story-players";
import { StoryTitleMenu } from "./story-title-menu";
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
        // The title's line: the title, whose caret opens the story's doors
        // (StoryTitleMenu: the library, Build scenes and the edit page for
        // the storyteller, the storyboard for everyone), and the PUBLIC
        // badge, about the whole story. The heart and the expand button end
        // the line (StoryPanel).
        heading={
          <HStack gap="2" align="center" wrap="wrap" minW="0">
            <StoryTitleMenu
              idStory={story.idStory}
              title={story.title}
              isStoryteller={story.isOwner}
              buildSceneId={buildSceneId}
              onImage={!!story.imageUrl}
            />
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
