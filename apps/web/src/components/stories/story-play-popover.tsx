"use client";

import { useId, useState } from "react";
import {
  Alert,
  Button,
  Field,
  NativeSelect,
  Popover,
  Portal,
  Stack,
  Tooltip,
} from "@chakra-ui/react";
import { formatDay } from "@/lib/dates";
import { newSessionTitle } from "@/lib/play";
import { sessionHeading, sessionStatusText } from "@/lib/stories";
import {
  sa_listUnfinishedSessions,
  sa_startPlaying,
  type UnfinishedSession,
} from "@/app/(app)/(nav)/play/actions";
import { PlayButtonFace } from "./story-play-button";

type Props = {
  idStory: number;
  title: string;
  /** As on PlayButtonFace: the waiting count, or null for the plain button. */
  count: number | null;
  label: string;
  tooltip: string;
};

// The value of "Create new session" in the select; a session's is its id.
const NEW = "";

/**
 * The storyteller's Play on a story card. Rather than going straight to the
 * table, it asks which session to play: a popover with the Session select
 * the Play page has, and one button that opens the table on it through
 * sa_startPlaying. The select starts on the session most recently touched
 * that is not DONE, since carrying on is the likelier wish, and on "Create
 * new session" when there is none. The button says Start for a new session
 * and Resume for one that already exists.
 *
 * The sessions are fetched each time the popover opens, not with the card:
 * a board of cards would otherwise ask for every story's sessions to show a
 * popover that is rarely opened.
 */
export function StoryPlayPopover({ idStory, title, count, label, tooltip }: Props) {
  // One id for both machines' trigger, so the popover positions itself
  // against the same button the tooltip does (docs/standards.md).
  const triggerId = useId();
  const selectId = useId();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<UnfinishedSession[] | null>(null);
  const [choice, setChoice] = useState(NEW);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setStarting] = useState(false);

  async function load() {
    setSessions(null);
    setError(null);
    let list: UnfinishedSession[] = [];
    try {
      list = await sa_listUnfinishedSessions(idStory);
    } catch {
      // Creating a new session is still on offer, which is what an empty
      // list starts on.
    }
    setSessions(list);
    setChoice(list.length > 0 ? String(list[0].idStorySession) : NEW);
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      // On success the action redirects and this never returns, so the
      // button stays loading until the table has loaded. Anything that comes
      // back is a refusal to show. The day is read here, in the browser, so
      // a new session is titled with the storyteller's own date.
      const result = await sa_startPlaying(
        idStory,
        choice === NEW ? null : Number(choice),
        newSessionTitle(formatDay(new Date())),
      );
      setError(result.error);
    } catch {
      setError("The table could not be opened. Try again.");
    }
    setStarting(false);
  }

  const isLoading = sessions === null;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (details.open) load();
      }}
      positioning={{ placement: "top-start" }}
      ids={{ trigger: triggerId }}
    >
      <Tooltip.Root
        openDelay={200}
        positioning={{ placement: "top" }}
        ids={{ trigger: triggerId }}
        // The popover opens upward, where the tooltip would sit on top of it.
        disabled={open}
      >
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <PlayButtonFace count={count} label={label} />
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>{tooltip}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          {/* Clicks inside bubble through React's tree to the card, whose
              handlers must not see them. */}
          <Popover.Content w="xs" onClick={(event) => event.stopPropagation()}>
            <Popover.Arrow />
            <Popover.Header>
              <Popover.Title fontWeight="semibold">Play {title}</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="4">
                <Field.Root>
                  <Field.Label htmlFor={selectId}>Session</Field.Label>
                  <NativeSelect.Root size="sm" disabled={isLoading || isStarting}>
                    <NativeSelect.Field
                      id={selectId}
                      value={choice}
                      onChange={(event) => setChoice(event.target.value)}
                    >
                      <option value={NEW}>Create new session</option>
                      {(sessions ?? []).map((session) => (
                        <option key={session.idStorySession} value={session.idStorySession}>
                          {sessionHeading(session)} · {sessionStatusText(session.status)}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                {error && (
                  // role="alert", which Chakra's Alert does not set itself.
                  <Alert.Root role="alert" status="error" size="sm">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}
                <Button
                  size="sm"
                  alignSelf="end"
                  onClick={start}
                  disabled={isLoading}
                  loading={isStarting}
                >
                  {choice === NEW ? "Start" : "Resume"}
                </Button>
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
