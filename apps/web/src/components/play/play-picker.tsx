"use client";

import { useId, useState } from "react";
import NextLink from "next/link";
import { Alert, Button, Field, HStack, Link, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { Play } from "lucide-react";
import { formatDay } from "@/lib/dates";
import { newSessionTitle } from "@/lib/play";
import { sessionHeading, sessionStatusText } from "@/lib/stories";
import {
  sa_listUnfinishedSessions,
  sa_startPlaying,
  type PlayableStory,
  type UnfinishedSession,
} from "@/app/(app)/(nav)/play/actions";

type Props = {
  /** The caller's active stories, newest first, loaded by the page. */
  stories: PlayableStory[];
};

// What the session select is showing: nothing yet, the list loading for a
// story, or the list for that story. Keyed by story so a slow answer for a
// story the user has since moved off is never shown against the new one.
type Sessions =
  | { idStory: null }
  | { idStory: number; loading: true }
  | { idStory: number; loading: false; sessions: UnfinishedSession[] };

// The way in from the Play primer: pick a story, press Play. Native selects
// like the new-story form's, since the lists are plain text and the
// browser's own control is the most accessible one on a phone.
//
// For a story the caller tells, a second select chooses the session: a new
// one, which is the default, or one not yet DONE to carry on with. Play then
// opens the table through sa_startPlaying, which makes that session the
// story's current one. For a story they only play in there is nothing to
// choose, and Play is a plain link to the table, which sends them on to the
// waiting room if no session is open.
export function PlayPicker({ stories }: Props) {
  const [idStory, setIdStory] = useState("");
  const [idSession, setIdSession] = useState("");
  const [sessions, setSessions] = useState<Sessions>({ idStory: null });
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setStarting] = useState(false);
  const storySelectId = useId();
  const sessionSelectId = useId();

  if (stories.length === 0) {
    return (
      <Text color="fg.muted">
        You are not in any story yet. Join one on the Stories page, or{" "}
        <Link asChild variant="underline">
          <NextLink href="/stories/new">start one</NextLink>
        </Link>
        .
      </Text>
    );
  }

  const story = stories.find((s) => String(s.idStory) === idStory) ?? null;

  async function chooseStory(value: string) {
    setIdStory(value);
    setIdSession("");
    setError(null);
    const chosen = stories.find((s) => String(s.idStory) === value);
    if (!chosen?.isOwner) {
      setSessions({ idStory: null });
      return;
    }
    setSessions({ idStory: chosen.idStory, loading: true });
    let list: UnfinishedSession[] = [];
    try {
      list = await sa_listUnfinishedSessions(chosen.idStory);
    } catch {
      // Creating a new session is still on offer, which is the default.
    }
    setSessions((current) =>
      current.idStory === chosen.idStory
        ? { idStory: chosen.idStory, loading: false, sessions: list }
        : current,
    );
  }

  async function start() {
    if (!story) return;
    setStarting(true);
    setError(null);
    try {
      // On success the action redirects and this never returns, so the
      // button stays loading until the table has loaded, as the story form's
      // does. Anything that comes back is a refusal to show.
      // The day is read here, in the browser, so it is the storyteller's
      // own; only a new session uses the title.
      const result = await sa_startPlaying(
        story.idStory,
        idSession ? Number(idSession) : null,
        newSessionTitle(formatDay(new Date())),
      );
      setError(result.error);
    } catch {
      setError("The table could not be opened. Try again.");
    }
    setStarting(false);
  }

  const isLoadingSessions = sessions.idStory !== null && sessions.loading;
  const listed = sessions.idStory !== null && !sessions.loading ? sessions.sessions : [];
  // Play waits for both choices: a story, and for the storyteller's own story
  // a session. "Create new session" is a choice in its own right, so the
  // second select counts as chosen as soon as its list has loaded.
  const canPlay = story !== null && !(story.isOwner && isLoadingSessions);

  return (
    <Stack gap="3">
      <HStack align="flex-end" gap="3" wrap="wrap">
        <Field.Root maxW="sm">
          <Field.Label htmlFor={storySelectId}>My Story...</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              id={storySelectId}
              value={idStory}
              onChange={(event) => chooseStory(event.target.value)}
            >
              <option value="">Choose a story</option>
              {stories.map((s) => (
                <option key={s.idStory} value={s.idStory}>
                  {s.title}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>

        {story?.isOwner && (
          <Field.Root maxW="sm">
            <Field.Label htmlFor={sessionSelectId}>Session</Field.Label>
            <NativeSelect.Root disabled={isLoadingSessions}>
              <NativeSelect.Field
                id={sessionSelectId}
                value={idSession}
                onChange={(event) => setIdSession(event.target.value)}
              >
                <option value="">Create new session</option>
                {listed.map((session) => (
                  <option key={session.idStorySession} value={session.idStorySession}>
                    {sessionHeading(session)} · {sessionStatusText(session.status)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
        )}

        {!story || !canPlay ? (
          <Button disabled>
            <Play />
            Play
          </Button>
        ) : story.isOwner ? (
          <Button onClick={start} loading={isStarting} loadingText="Opening">
            <Play />
            Play
          </Button>
        ) : (
          // A player's Play is a real link, so it opens in a new tab like
          // any other; there is nothing to set up before they go.
          <Button asChild>
            <NextLink href={`/play/${story.idStory}`}>
              <Play />
              Play
            </NextLink>
          </Button>
        )}
      </HStack>

      {error && (
        // role="alert", which Chakra's Alert does not set itself.
        <Alert.Root role="alert" status="error" size="sm" maxW="xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
    </Stack>
  );
}
