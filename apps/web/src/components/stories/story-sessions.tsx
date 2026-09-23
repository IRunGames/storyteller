"use client";

import { useState, useTransition } from "react";
import { Box, Button, HStack, List, Stack, Text } from "@chakra-ui/react";
import { ChevronsRight } from "lucide-react";
import {
  formatLastPlayed,
  formatSessionLength,
  SESSION_STATUS_TEXT,
  SESSIONS_PAGE_SIZE,
  type StorySession,
} from "@/lib/stories";
import { sa_listStorySessions } from "@/app/(app)/(nav)/stories/actions";

type Props = {
  idGame: number;
  /** The first page of the story's sessions, loaded by the page. */
  initial: StorySession[];
  /** The colour for secondary text; the story page passes the panel's. */
  mutedColor?: string;
};

// The list under Recent sessions on a story's page. The page hands over the
// first five; the rest come from the same action on More, a page at a time.
// A page shorter than SESSIONS_PAGE_SIZE means the well is dry, and nothing
// here is ever added or removed on the client, so the count of rows shown is
// also the offset of the next page.
export function StorySessions({ idGame, initial, mutedColor = "fg.muted" }: Props) {
  const [sessions, setSessions] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === SESSIONS_PAGE_SIZE);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [, startTransition] = useTransition();

  function onMore() {
    const offset = sessions.length;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const page = await sa_listStorySessions(idGame, offset);
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

  return (
    <Stack gap="4">
      <List.Root listStyleType="none" gap="2">
        {sessions.map((session) => (
          <List.Item key={session.idGameSession}>
            <HStack justify="space-between" gap="4">
              <Text>{formatLastPlayed(session.startedAt)}</Text>
              {/* The length is generated once the session is done; before
                  that the status says why there is none. */}
              <Text color={session.length === null ? mutedColor : undefined}>
                {session.length === null
                  ? SESSION_STATUS_TEXT[session.status]
                  : formatSessionLength(session.length)}
              </Text>
            </HStack>
          </List.Item>
        ))}
      </List.Root>

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
