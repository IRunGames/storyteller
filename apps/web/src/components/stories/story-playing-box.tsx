"use client";

import { useId, useState } from "react";
import { Box, Heading, HStack, IconButton, Portal, Stack, Tooltip } from "@chakra-ui/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { StatusOption } from "@/lib/status";
import { PREP_SESSIONS_PAGE_SIZE, type StorySession } from "@/lib/stories";
import { StorySessions } from "@/components/stories/story-sessions";
import { StoryInfoPopover } from "./story-info-popover";

type Props = {
  idStory: number;
  /** The story being played, for "Playing <title>". */
  title: string;
  /** The first page of the story's sessions, PREP_SESSIONS_PAGE_SIZE long, loaded by the page. */
  sessions: StorySession[];
  /**
   * The story_sessions workflow, for each row's status pill; left out, the
   * status is the plain word, as the players' table shows it.
   */
  sessionStatusOptions?: StatusOption[];
  /** The viewer is the story's owner, so each row has its pencil and bin. */
  canManage: boolean;
};

/**
 * What the play space shows while it is on no scene, at the storyteller's
 * table (RunTable) and the players' (PlaySpace), in its lower-left corner: "Playing <title>" on the panel colour, part
 * see-through so the cover behind still shows, and the story's sessions
 * folded away under a Sessions chevron, closed to begin with.
 *
 * The list is the library's Timeline (StorySessions, with the same page
 * size, players and titles), so a session reads the same in both places.
 * The pencil and the bin are for the story's owner only, as there, so the
 * players' table has none. Each row's status is a plain pill here rather
 * than a menu: the session chip in the run table's header is where the
 * table's session changes status, and a second control for it here would
 * leave the two disagreeing.
 */
export function StoryPlayingBox({
  idStory,
  title,
  sessions,
  sessionStatusOptions,
  canManage,
}: Props) {
  const headingId = useId();
  const sessionsId = useId();
  const [showSessions, setShowSessions] = useState(false);

  return (
    <Box
      position="absolute"
      bottom="4"
      left="4"
      maxW="lg"
      w="calc(100% - 2rem)"
      maxH="calc(100% - 2rem)"
      overflowY="auto"
      p="4"
      rounded="xl"
      bg="bg.panel/80"
      backdropFilter="blur(6px)"
      shadow="md"
      data-testid="story-playing-box"
    >
      <Stack gap="3">
        {/* The story's info beside its name, as a session row has its own. */}
        <HStack gap="1" align="center">
          <Heading as="h2" size="lg" minW="0">
            Playing {title}
          </Heading>
          <StoryInfoPopover idStory={idStory} />
        </HStack>
        <Stack as="section" aria-labelledby={headingId} gap="2">
          <HStack gap="2" align="center">
            <Heading id={headingId} as="h3" size="sm">
              Sessions
            </Heading>
            <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
              <Tooltip.Trigger asChild>
                {/* A disclosure, as the waiting room's Sessions so far
                    chevron is: aria-expanded and aria-controls, a name that
                    stays the same either way, and the chevron pointing the
                    way the list will move. */}
                <IconButton
                  aria-label="Show sessions"
                  aria-expanded={showSessions}
                  aria-controls={sessionsId}
                  variant="ghost"
                  size="sm"
                  rounded="full"
                  onClick={() => setShowSessions((open) => !open)}
                >
                  {showSessions ? <ChevronUp /> : <ChevronDown />}
                </IconButton>
              </Tooltip.Trigger>
              <Portal>
                <Tooltip.Positioner>
                  <Tooltip.Content>
                    {showSessions ? "Hide sessions" : "Show sessions"}
                  </Tooltip.Content>
                </Tooltip.Positioner>
              </Portal>
            </Tooltip.Root>
          </HStack>
          {/* Hidden rather than unmounted, so folding the list away and back
              keeps the pages already loaded and any edit panel left open. */}
          <Box id={sessionsId} hidden={!showSessions}>
            <StorySessions
              idStory={idStory}
              initial={sessions}
              pageSize={PREP_SESSIONS_PAGE_SIZE}
              showPlayers
              canManage={canManage}
              statusOptions={sessionStatusOptions}
              showTitles
            />
          </Box>
        </Stack>
      </Stack>
    </Box>
  );
}
