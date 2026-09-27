"use client";

import { useState, useTransition } from "react";
import { Box, Button, HStack, List, Stack, Text } from "@chakra-ui/react";
import { ChevronsRight } from "lucide-react";
import { matchesFilter } from "@/lib/filter-text";
import { statusLabel, type StatusOption } from "@/lib/status";
import {
  formatLastPlayed,
  formatPlayerCount,
  formatSessionLength,
  sessionStatusText,
  SESSIONS_PAGE_SIZE,
  sessionHeading,
  type StorySession,
} from "@/lib/stories";
import { sa_listStorySessions } from "@/app/(app)/(nav)/stories/actions";
import { StatusPill } from "@/components/status/status-pill";
import { PlayerCount } from "./player-count";
import { LocalDate } from "@/components/dates/local-date";
import { SessionInfoPopover } from "./session-info-popover";

type Props = {
  idStory: number;
  /** The first page of the story's sessions, loaded by the page. */
  initial: StorySession[];
  /**
   * How many rows a page holds, which is how many the More button asks for.
   * The default is the story page's; the Prep Work timeline passes its own.
   * It must match the page size the initial rows were loaded with, or the
   * first More either skips rows or repeats them.
   */
  pageSize?: number;
  /**
   * The story_sessions workflow. Given it, each row's status is a pill on
   * the ramp; without it the status is the plain text the story page shows.
   */
  statusOptions?: StatusOption[];
  /** The viewer is the storyteller, so the pills are menus. */
  canEditStatus?: boolean;
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
   * The statuses still switched on above the search box. A row whose status
   * is not among them is left out; undefined is no such filter at all, which
   * is what the story page passes.
   */
  shownStatuses?: string[];
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
  pageSize = SESSIONS_PAGE_SIZE,
  statusOptions,
  shownStatuses,
  canEditStatus = false,
  mutedColor = "fg.muted",
  playerCount,
  filter = "",
  showTitles = false,
}: Props) {
  const [sessions, setSessions] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === pageSize);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [, startTransition] = useTransition();

  function onMore() {
    const offset = sessions.length;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const page = await sa_listStorySessions(idStory, offset, pageSize);
        setSessions((current) => [...current, ...page]);
        setHasMore(page.length === pageSize);
      } catch {
        // Leave the list as it was; the button stays so they can retry.
      } finally {
        setLoadingMore(false);
      }
    });
  }

  // A status the pill has just moved stays moved, so the row does not snap
  // back to the old word while the list waits for its next load.
  function onStatusChanged(idStorySession: number, status: string) {
    setSessions((current) =>
      current.map((session) =>
        session.idStorySession === idStorySession ? { ...session, status } : session,
      ),
    );
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
      // The row shows a person and a number; the words are what a search for
      // "3 players" has to match, so they stay in the text behind it.
      players: playerCount === undefined ? null : formatPlayerCount(playerCount),
      // The length is generated once the session is done. Where a pill shows
      // the status there is nothing to put in its place before then; where
      // there is no pill, the status text says why there is no length.
      length:
        session.length !== null
          ? formatSessionLength(session.length)
          : statusOptions
            ? null
            : sessionStatusText(session.status),
    }))
    // A status switched off above the box takes its rows out, whatever they
    // say. Checked before the words, since it is the cheaper answer.
    .filter((row) => shownStatuses === undefined || shownStatuses.includes(row.session.status))
    // The status is searchable whether it is a pill or the text: a
    // storyteller looking for "suspended" means the same thing either way.
    .filter((row) =>
      matchesFilter(
        [row.heading, row.date, row.players, row.length, statusLabel(row.session.status)].join(" "),
        filter,
      ),
    );

  return (
    <Stack gap="4">
      {rows.length === 0 ? (
        <Text color={mutedColor}>No matches.</Text>
      ) : (
        <List.Root listStyleType="none" gap="2">
          {rows.map(({ session, heading, length }) => (
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
                <Text>
                  <LocalDate value={session.startedAt} />
                </Text>
                {playerCount !== undefined && (
                  <PlayerCount count={playerCount} color={mutedColor} flex="none" />
                )}
                {length !== null && (
                  <Text color={session.length === null ? mutedColor : undefined}>{length}</Text>
                )}
                {statusOptions && (
                  <StatusPill
                    table="story_sessions"
                    id={session.idStorySession}
                    status={session.status}
                    options={statusOptions}
                    canEdit={canEditStatus}
                    onChanged={(status) => onStatusChanged(session.idStorySession, status)}
                  />
                )}
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
