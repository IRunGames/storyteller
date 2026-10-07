"use client";

import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Input,
  Portal,
  Stack,
  Tooltip,
} from "@chakra-ui/react";
import { Dices } from "lucide-react";
import { useUser } from "@/components/auth/user-provider";
import type { ChatEntry } from "@/lib/chat";
import { PlayChatEntry } from "./play-chat-entry";

// What the chat will be used for, shown until the first real message: a
// storyteller's line, a roll with its dice and outcome, and players talking.
// Made up, labelled as such, and drawn muted.
const SAMPLE_ONLINE = 4;
const SAMPLE_ENTRIES: ChatEntry[] = [
  {
    id: "s1",
    kind: "text",
    from: "Storyteller",
    time: "8:04 PM",
    text: "Rain hammers the car roof. Whatever is in the back seat, it was not there when you parked, you know.",
  },
  {
    id: "s2",
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
    kind: "text",
    from: "Harry",
    time: "8:06 PM",
    text: "The box on the back seat — it's ticking. Not like a clock. Like a heartbeat.",
  },
  {
    id: "s4",
    kind: "text",
    from: "Tom",
    time: "8:07 PM",
    text: "Nobody touches it until we hear what David says.",
  },
];

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

type Props = {
  /** The panel's id, which the header's Chat toggle points at. */
  id: string;
};

// The table's chat: the right-hand panel. A placeholder until the messaging
// service lands: messages live in this component's state only, nobody else
// sees them, and a sample conversation stands in until the first is sent.
// Its input sits at the foot of the panel rather than across the page, so
// closing the chat takes the input with it.
export function PlayChat({ id }: Props) {
  const user = useUser();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  // TODO: populate from the messaging service's presence feed.
  const [online] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const isSample = entries.length === 0;
  // The sample's own count while the sample shows, so the header and the
  // conversation under it tell the same made-up story.
  const onlineCount = isSample ? SAMPLE_ONLINE : online.length;

  function send() {
    const text = input.trim();
    if (!text) return;
    // TODO: deliver through the messaging service.
    setEntries((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind: "text",
        from: user.nickName || user.name,
        time: timeFormat.format(new Date()),
        text,
      },
    ]);
    setInput("");
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

      <Box flex="1" minH="0" overflowY="auto" px="4" py="3">
        <Stack gap="4">
          {isSample && (
            <Badge size="sm" variant="outline" alignSelf="start">
              Sample conversation
            </Badge>
          )}
          {(isSample ? SAMPLE_ENTRIES : entries).map((entry) => (
            <PlayChatEntry key={entry.id} entry={entry} isSample={isSample} />
          ))}
        </Stack>
        <div ref={endRef} />
      </Box>

      <HStack gap="2" p="3" borderTopWidth="1px">
        {/* Enter sends: the button beside it is for rolling, as at the table
            itself, where talking needs no button. */}
        <Input
          aria-label="Message"
          placeholder="Say something..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          autoComplete="off"
        />
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
