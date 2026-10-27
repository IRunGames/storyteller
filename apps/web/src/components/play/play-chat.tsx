"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Badge, Box, Button, Flex, Heading, HStack, Stack } from "@chakra-ui/react";
import { PlayChatEntry } from "./play-chat-entry";
import { PlayChatInput } from "./play-chat-input";
import { PlayChatLayoutPicker, useChatLayout } from "./play-chat-layout";
import type { StoryChat } from "./use-story-chat";

type Props = {
  /** The panel's id, which the header's Chat toggle points at. */
  id: string;
  idStory: number;
  /** The chat as the table holds it (useStoryChat), which keeps listening while this panel is closed. */
  chat: StoryChat;
};

// The table's chat: the right-hand panel, in the standard or compact
// layout (the overlay has no panel: PlayChatOverlay). The lines are the
// table's (useStoryChat), loaded from the database and kept up to date over
// the story's chat topic; this panel draws them and sends what is typed
// (PlayChatInput), and goes when it is closed while the table keeps
// listening. An empty chat is simply empty. The header holds the layout
// picker and counts who is at the table: the players seated and the
// storyteller. The Previous… button heads the list while there are older
// lines, so it comes into view as the reader scrolls up to it. Its input
// sits at the foot of the panel rather than across the page, so closing the
// chat takes the input with it.
export function PlayChat({ id, idStory, chat }: Props) {
  const { entries, hasPrevious, loadingPrevious, loadPrevious, merge, remove, atTable } = chat;
  const [layout] = useChatLayout();
  const compact = layout === "compact";
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

  async function previous() {
    const box = scrollRef.current;
    if (box) anchor.current = { height: box.scrollHeight, top: box.scrollTop };
    await loadPrevious();
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
      <HStack gap="2" px="4" py="3" borderBottomWidth="1px">
        <Heading id={`${id}-heading`} size="md">
          Table Chat
        </Heading>
        <PlayChatLayoutPicker />
        <Box flex="1" />
        {atTable > 0 && (
          <Badge colorPalette="green" variant="subtle" rounded="full" size="lg">
            {atTable} at the table
          </Badge>
        )}
      </HStack>

      <Box ref={scrollRef} flex="1" minH="0" overflowY="auto" px="4" py="3">
        <Stack gap={compact ? "2" : "4"}>
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
          {entries.map((entry) => (
            <PlayChatEntry
              key={entry.id}
              entry={entry}
              idStory={idStory}
              compact={compact}
              onEdited={merge}
              onDeleted={remove}
            />
          ))}
        </Stack>
        <div ref={endRef} />
      </Box>

      <HStack p="3" borderTopWidth="1px">
        <PlayChatInput idStory={idStory} chat={chat} />
      </HStack>
    </Flex>
  );
}
