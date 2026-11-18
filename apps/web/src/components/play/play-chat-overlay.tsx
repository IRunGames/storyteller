"use client";

import { useEffect, useRef, useState } from "react";
import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import { chatTime, senderNameColor, senderPalette, type ChatEntry } from "@/lib/chat";
import { RollCard, SenderAvatar } from "./play-chat-entry";
import { PlayChatInput } from "./play-chat-input";
import { PlayChatLayoutPicker } from "./play-chat-layout";
import type { StoryChat } from "./use-story-chat";
import { useLatest } from "@/hooks/use-latest";

type Props = {
  /** The box's id, which the header's Chat toggle points at. */
  id: string;
  idStory: number;
  chat: StoryChat;
  /**
   * Whether the box to type in shows. The display table
   * (/stories/[id]/table) leaves it out for a guest, who reads the table's
   * lines but has no account to speak with.
   */
  canPost?: boolean;
  /** Whether the layout picker shows; the display table has no other layout to pick. */
  showLayoutPicker?: boolean;
};

// How long a line stays over the table.
const SHOWN_FOR = 10_000;
// How many lines stack up at most; the oldest goes when a ninth arrives.
const MAX_SHOWN = 8;

/** A line on show over the table, and the timer that takes it down. */
type Shown = { entry: ChatEntry; timer: ReturnType<typeof setTimeout> };

// The overlay chat: no panel, a small box in the lower right to type in,
// with the layout picker beside it, and each line said while it is up shown
// above the box for ten seconds, quietly, the newest at the foot. Lines
// pile up rather than replace each other, and go on their own.
//
// A line is shown once, when it is first held: what the chat's first page
// brought, what was already held when the overlay opened, and older lines,
// are not. Edits and rolls arrive the same way as any line; a taken-back
// line leaves the overlay at once.
//
// The lines are a list of this component's own rather than a second
// toaster: a toast carries a title and a description, and a chat line
// carried through a toast's `meta` had to be read back out of it untyped.
export function PlayChatOverlay({
  id,
  idStory,
  chat,
  canPost = true,
  showLayoutPicker = true,
}: Props) {
  const { entries, loaded } = chat;
  const [shown, setShown] = useState<Shown[]>([]);
  // The newest line held once the chat had loaded with the overlay up; only
  // lines after it show.
  const shownUpTo = useRef<number | null>(null);

  useEffect(() => {
    if (!loaded) return;
    const newestId = entries.reduce((max, entry) => Math.max(max, entry.idChat), 0);
    if (shownUpTo.current === null) {
      shownUpTo.current = newestId;
      return;
    }
    const since = shownUpTo.current;
    shownUpTo.current = Math.max(since, newestId);
    const held = new Set(entries.map((entry) => entry.idChat));
    setShown((current) => {
      // A line taken back leaves the overlay too.
      const kept = current.filter((line) => {
        if (held.has(line.entry.idChat)) return true;
        clearTimeout(line.timer);
        return false;
      });
      const added = entries
        .filter((entry) => entry.idChat > since)
        .map((entry) => ({
          entry,
          timer: setTimeout(
            () => setShown((lines) => lines.filter((line) => line.entry.idChat !== entry.idChat)),
            SHOWN_FOR,
          ),
        }));
      const all = [...kept, ...added];
      for (const line of all.slice(0, Math.max(0, all.length - MAX_SHOWN)))
        clearTimeout(line.timer);
      return all.slice(-MAX_SHOWN);
    });
  }, [entries, loaded]);

  // Leaving the overlay takes its lines with it, and their timers.
  const shownRef = useLatest(shown);
  useEffect(() => () => shownRef.current.forEach((line) => clearTimeout(line.timer)), [shownRef]);

  return (
    <>
      {shown.length > 0 && (
        <Stack
          role="log"
          aria-label="Table chat lines"
          position="fixed"
          bottom="5.5rem"
          right="4"
          left={{ base: "4", md: "auto" }}
          w={{ md: "sm" }}
          zIndex="toast"
          gap="2"
          pointerEvents="none"
        >
          {shown.map(({ entry }) => (
            <Box
              key={entry.idChat}
              py="2"
              px="3"
              bg="bg.panel/75"
              color="fg"
              borderWidth="1px"
              rounded="l2"
              shadow="sm"
              backdropFilter="blur(6px)"
            >
              <ChatToastLine entry={entry} />
            </Box>
          ))}
        </Stack>
      )}

      {(canPost || showLayoutPicker) && (
        <HStack
          as="section"
          id={id}
          aria-label="Table Chat"
          position="fixed"
          bottom="4"
          right="4"
          zIndex="docked"
          w={{ base: "calc(100% - 2rem)", md: "sm" }}
          gap="2"
          p="2"
          bg="bg.panel"
          borderWidth="1px"
          rounded="lg"
          shadow="md"
        >
          {showLayoutPicker && <PlayChatLayoutPicker />}
          {canPost && <PlayChatInput idStory={idStory} chat={chat} small />}
        </HStack>
      )}
    </>
  );
}

/** One line as the overlay shows it: small, the sender's picture and name, then what they said. */
function ChatToastLine({ entry }: { entry: ChatEntry }) {
  const time = chatTime(entry.createdAt);

  if (entry.kind === "scene" || entry.kind === "system") {
    return (
      <Text textStyle="xs" color="fg.muted" fontStyle="italic">
        {entry.text}
      </Text>
    );
  }

  return (
    <HStack align="start" gap="2" minW="0" w="full">
      <SenderAvatar entry={entry} size="2xs" />
      <Stack gap="0.5" minW="0" flex="1">
        <HStack gap="2" align="baseline">
          <Text
            textStyle="xs"
            colorPalette={senderPalette(entry.from)}
            color={entry.color ? senderNameColor(entry.color) : "colorPalette.fg"}
            fontWeight="bold"
          >
            {entry.from}
          </Text>
          <Text textStyle="2xs" color="fg.muted">
            {time}
          </Text>
        </HStack>
        {entry.kind === "text" ? (
          <Text textStyle="sm">{entry.text}</Text>
        ) : (
          <Box>
            <RollCard entry={entry} compact />
          </Box>
        )}
      </Stack>
    </HStack>
  );
}
