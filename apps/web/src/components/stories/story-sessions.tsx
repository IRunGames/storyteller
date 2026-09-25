"use client";

import { useState, useTransition } from "react";
import { Box, Button, HStack, List, Stack, Text } from "@chakra-ui/react";
import { ChevronsRight } from "lucide-react";
import { matchesFilter } from "@/lib/filter-text";
import {
  formatLastPlayed,
  formatPlayerCount,
  formatSessionLength,
  SESSION_STATUS_TEXT,
  SESSIONS_PAGE_SIZE,
  sessionHeading,
  type StorySession,
} from "@/lib/stories";
import { sa_listStorySessions } from "@/app/(app)/(nav)/stories/actions";
import { SessionInfoPopover } from "./session-info-popover";

type Props = {
  idStory: number;
  /** The first page of the story's sessions, loaded by the page. */
  initial: StorySession[];
  /** The colour for secondary text; the story page passes the panel's. */
  mutedColor?: string;
  /**
   * Shown on every row when given. A session does not record who attended,
   * so the Prep Work timeline passes the story's current player count and
   * every row reads the same until sessions keep their own.
   */
  playerCount?: number;
  /**
   * What the Prep Work column's search box holds. A row stays when any of
   * its text matches: the date, the player count, the length or the status.
   */
  filter?: string;
  /**
   * Lead each row with "3. Kildealg". Off by default: the story page and
   * a Prep Work column at its usual width have no room for it, and the
   * expanded column does.
   */
  showTitles?: boolean;
};

// The list under Recent sessions on a story's page, and the Prep Work
// timeline. The page hands over the first five; the rest come from the same
// action on More, a page at a time. A page shorter than SESSIONS_PAGE_SIZE
// means the well is dry, and nothing here is ever added or removed on the
// client, so the count of rows shown is also the offset of the next page.
export function StorySessions({
  idStory,
  initial,
  mutedColor = "fg.muted",
  playerCount,
  filter = "",
  showTitles = false,
}: Props) {
  const [sessions, setSessions] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === SESSIONS_PAGE_SIZE);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [, startTransition] = useTransition();

  function onMore() {
    const offset = sessions.length;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const page = await sa_listStorySessions(idStory, offset);
        setSessions((current) => [...current, ...page]);
        setHasMore(page.length === SESSIONS_PAGE_SIZE);
      } catch {
        // Leave the list as it was; the button stays so they can retry.
      } finally {
        setLoadingMore(false);
      }
    });
  }

  if (sessions.length === 0) {
    return <Text color={mutedColor}>No sessions yet.</Text>;
  }

  // The filter runs over the same strings the row shows, so what matches is
  // what the reader can see. The More button stays below an empty result:
  // the rows not yet loaded may match.
  const rows = sessions
    .map((session) => ({
      session,
      heading: showTitles ? sessionHeading(session) : null,
      date: formatLastPlayed(session.startedAt),
      players: playerCount === undefined ? null : formatPlayerCount(playerCount),
      // The length is generated once the session is done; before that the
      // status says why there is none.
      length:
        session.length === null
          ? SESSION_STATUS_TEXT[session.status]
          : formatSessionLength(session.length),
    }))
    .filter((row) =>
      matchesFilter([row.heading, row.date, row.players, row.length].join(" "), filter),
    );

  return (
    <Stack gap="4">
      {rows.length === 0 ? (
        <Text color={mutedColor}>No matches.</Text>
      ) : (
        <List.Root listStyleType="none" gap="2">
          {rows.map(({ session, heading, date, players, length }) => (
            <List.Item key={session.idStorySession}>
              {/* Nothing here wraps: a date broken over two lines reads
                  worse than a row that runs a little tight in a narrow
                  Prep Work column. The heading takes what is left and
                  truncates, so the date and length keep their place. */}
              <HStack justify="space-between" gap="3" whiteSpace="nowrap">
                {heading !== null && (
                  <Text flex="1" minW="0" truncate fontWeight="medium">
                    {heading}
                  </Text>
                )}
                <Text>{date}</Text>
                {players !== null && <Text color={mutedColor}>{players}</Text>}
                <Text color={session.length === null ? mutedColor : undefined}>{length}</Text>
                <SessionInfoPopover idStorySession={session.idStorySession} color={mutedColor} />
              </HStack>
            </List.Item>
          ))}
        </List.Root>
      )}

      {hasMore && (
        <Box>
          <Button variant="outline" onClick={onMore} loading={isLoadingMore} loadingText="More">
            More
            <ChevronsRight />
          </Button>
        </Box>
      )}
    </Stack>
  );
}
