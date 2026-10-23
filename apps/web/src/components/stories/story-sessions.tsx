"use client";

import { useState, useTransition } from "react";
import { Box, Button, HStack, List, Stack, Text } from "@chakra-ui/react";
import { ChevronsRight, Pencil } from "lucide-react";
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
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { DeleteSessionButton } from "./delete-session-button";
import { SessionEditPanel } from "./session-edit-panel";
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
   * Each row shows how many came to its session, counted as the session's
   * info panel lists them. The Prep Work timeline has the room for it.
   */
  showPlayers?: boolean;
  /**
   * The storyteller's controls on each row: a pencil that opens the
   * session's edit panel in place under it (SessionEditPanel), and a bin
   * that deletes it once asked (DeleteSessionButton). The Prep Work
   * timeline's, for the story's owner.
   */
  canManage?: boolean;
  /**
   * A session just made from the column's +: it goes in at the top, as the
   * newest, with its edit panel open, until the page's next load has it.
   */
  created?: StorySession | null;
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
// means the well is dry, and the count of rows shown is also the offset of
// the next page. That holds for the rows the storyteller makes and deletes
// here too: a new session is the newest, so it is first in the server's
// order as it is here, and a deleted one leaves both lists alike.
export function StorySessions({
  idStory,
  initial,
  pageSize = SESSIONS_PAGE_SIZE,
  statusOptions,
  shownStatuses,
  canEditStatus = false,
  mutedColor = "fg.muted",
  showPlayers = false,
  canManage = false,
  created = null,
  filter = "",
  showTitles = false,
}: Props) {
  const [sessions, setSessions] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === pageSize);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [, startTransition] = useTransition();
  // The row whose edit panel is open, by id, or null for none.
  const [editing, setEditing] = useState<number | null>(null);

  // A session made from the +: at the top with its panel open. Taken in
  // while rendering, as React has state follow a prop that changed, rather
  // than in an effect that would draw the list once without it. Matched by
  // id, so one the page's own load already has goes in once.
  const [seenCreated, setSeenCreated] = useState(created);
  if (created !== seenCreated) {
    setSeenCreated(created);
    if (created) {
      if (!sessions.some((session) => session.idStorySession === created.idStorySession)) {
        setSessions([created, ...sessions]);
      }
      setEditing(created.idStorySession);
    }
  }

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

  // The panel's Save: the row's heading follows the title as stored.
  function onSaved(idStorySession: number, title: string | null) {
    setSessions((current) =>
      current.map((session) =>
        session.idStorySession === idStorySession ? { ...session, title } : session,
      ),
    );
  }

  function onDeleted(idStorySession: number) {
    setSessions((current) =>
      current.filter((session) => session.idStorySession !== idStorySession),
    );
    setEditing((current) => (current === idStorySession ? null : current));
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
      players: showPlayers ? formatPlayerCount(session.playerCount) : null,
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
                {showPlayers && (
                  <PlayerCount count={session.playerCount} color={mutedColor} flex="none" />
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
                <SessionInfoPopover
                  idStorySession={session.idStorySession}
                  color={mutedColor}
                  onStatusChanged={(status) => onStatusChanged(session.idStorySession, status)}
                />
                {canManage && (
                  <HStack gap="0" flex="none">
                    <PrepIconButton
                      label={`Edit ${sessionHeading(session)}`}
                      expanded={editing === session.idStorySession}
                      onClick={() =>
                        setEditing((current) =>
                          current === session.idStorySession ? null : session.idStorySession,
                        )
                      }
                    >
                      <Pencil />
                    </PrepIconButton>
                    <DeleteSessionButton
                      idStorySession={session.idStorySession}
                      heading={sessionHeading(session)}
                      onDeleted={() => onDeleted(session.idStorySession)}
                    />
                  </HStack>
                )}
              </HStack>
              {/* In place under its row, on a faint tint so it reads as the
                  row's own rather than the next one. */}
              {canManage && editing === session.idStorySession && (
                <Box mt="2" mb="2" p="3" rounded="md" bg="bg.subtle">
                  <SessionEditPanel
                    idStorySession={session.idStorySession}
                    onSaved={(title) => onSaved(session.idStorySession, title)}
                    onClose={() => setEditing(null)}
                  />
                </Box>
              )}
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
