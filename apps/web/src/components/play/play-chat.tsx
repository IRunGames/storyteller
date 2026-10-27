"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Field,
  Flex,
  Heading,
  HStack,
  Input,
  Portal,
  Stack,
  Tooltip,
} from "@chakra-ui/react";
import { Dices } from "lucide-react";
import type { ChatEntry } from "@/lib/chat";
import { sa_postChat } from "@/app/(app)/play/[id]/actions";
import { PlayChatEntry } from "./play-chat-entry";
import type { StoryChat } from "./use-story-chat";

// What the chat will be used for, shown until the first real message: a
// storyteller's line, a roll with its dice and outcome, and players talking.
// Made up, labelled as such, and drawn muted.
const SAMPLE_ONLINE = 4;
// What a sample line carries for the fields a saved line has: no row, no
// sender, no profile, and a fixed time label in place of createdAt.
const SAMPLE = {
  idChat: null,
  idUser: null,
  color: null,
  picture: null,
  createdAt: "",
  isEdited: false,
} as const;
const SAMPLE_ENTRIES: ChatEntry[] = [
  {
    id: "s1",
    ...SAMPLE,
    kind: "text",
    from: "Storyteller",
    time: "8:04 PM",
    text: "Rain hammers the car roof. Whatever is in the back seat, it was not there when you parked, you know.",
  },
  {
    id: "s2",
    ...SAMPLE,
    kind: "roll",
    from: "Harry",
    time: "8:05 PM",
    dice: [4, 4],
    modifier: { value: 2, label: "Notice" },
    total: 10,
    formula: "2d6",
    label: "Spot the box",
    outcome: "SUCCESS",
  },
  {
    id: "s3",
    ...SAMPLE,
    kind: "text",
    from: "Harry",
    time: "8:06 PM",
    text: "The box on the back seat — it's ticking. Not like a clock. Like a heartbeat.",
  },
  {
    id: "s4",
    ...SAMPLE,
    kind: "text",
    from: "Tom",
    time: "8:07 PM",
    text: "Nobody touches it until we hear what David says.",
  },
];

type Props = {
  /** The panel's id, which the header's Chat toggle points at. */
  id: string;
  idStory: number;
  /** The chat as the table holds it (useStoryChat), which keeps listening while this panel is closed. */
  chat: StoryChat;
};

// The table's chat: the right-hand panel. The lines are the table's
// (useStoryChat), loaded from the database and kept up to date over the
// story's chat topic; this panel draws them and sends what is typed
// (sa_postChat), and goes when it is closed while the table keeps
// listening. A sample conversation stands in until there is a line. The
// Previous… button heads the list while there are older lines, so it comes
// into view as the reader scrolls up to it. Its input sits at the foot of
// the panel rather than across the page, so closing the chat takes the
// input with it.
export function PlayChat({ id, idStory, chat }: Props) {
  const { entries, hasPrevious, loadingPrevious, loadPrevious, merge } = chat;
  // TODO: populate from the messaging service's presence feed.
  const [online] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // The scroll height before Previous… put older lines on top, so the
  // reader can be kept where they were rather than thrown to the top.
  const anchor = useRef<{ height: number; top: number } | null>(null);

  // To the newest line when one is said, and on opening; not when older
  // lines are put on top, which would undo the reader's scroll.
  const newest = entries.at(-1)?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [newest]);

  const oldest = entries[0]?.id;
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box || !anchor.current) return;
    box.scrollTop = box.scrollHeight - anchor.current.height + anchor.current.top;
    anchor.current = null;
  }, [oldest]);

  const isSample = entries.length === 0;
  // The sample's own count while the sample shows, so the header and the
  // conversation under it tell the same made-up story.
  const onlineCount = isSample ? SAMPLE_ONLINE : online.length;

  async function previous() {
    const box = scrollRef.current;
    if (box) anchor.current = { height: box.scrollHeight, top: box.scrollTop };
    await loadPrevious();
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await sa_postChat(idStory, text);
      if (result.ok) {
        merge(result.chat);
        setInput("");
      } else {
        setError(result.error);
      }
    } catch {
      setError("The message could not be sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Flex
      as="section"
      id={id}
      aria-labelledby={`${id}-heading`}
      direction="column"
      minH="0"
      h="full"
      bg="bg.panel"
    >
      <HStack justify="space-between" gap="2" px="4" py="3" borderBottomWidth="1px">
        <Heading id={`${id}-heading`} size="md">
          Table Chat
        </Heading>
        {onlineCount > 0 && (
          <Badge colorPalette="green" variant="subtle" rounded="full" size="lg">
            {onlineCount} online
          </Badge>
        )}
      </HStack>

      <Box ref={scrollRef} flex="1" minH="0" overflowY="auto" px="4" py="3">
        <Stack gap="4">
          {hasPrevious && (
            <Button
              variant="ghost"
              size="xs"
              alignSelf="center"
              loading={loadingPrevious}
              onClick={() => void previous()}
            >
              Previous…
            </Button>
          )}
          {isSample && (
            <Badge size="sm" variant="outline" alignSelf="start">
              Sample conversation
            </Badge>
          )}
          {(isSample ? SAMPLE_ENTRIES : entries).map((entry) => (
            <PlayChatEntry
              key={entry.id}
              entry={entry}
              isSample={isSample}
              idStory={idStory}
              onEdited={merge}
            />
          ))}
        </Stack>
        <div ref={endRef} />
      </Box>

      <HStack gap="2" p="3" borderTopWidth="1px" align="start">
        {/* Enter sends: the button beside it is for rolling, as at the table
            itself, where talking needs no button. A refusal keeps the text
            so it can be sent again. */}
        <Field.Root invalid={error !== null}>
          <Input
            aria-label="Message"
            placeholder="Say something..."
            value={input}
            readOnly={sending}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            autoComplete="off"
          />
          {error && <Field.ErrorText>{error}</Field.ErrorText>}
        </Field.Root>
        <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
          <Tooltip.Trigger asChild>
            {/* A disabled button swallows pointer events, so the wrapper is
                what the tooltip listens to, as on the notifications bell. */}
            <Box as="span" display="inline-flex" flexShrink="0">
              <Button colorPalette="orange" disabled>
                <Dices />
                Roll
              </Button>
            </Box>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content>Coming soon</Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      </HStack>
    </Flex>
  );
}
