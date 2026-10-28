"use client";

import { useEffect, useRef } from "react";
import {
  Toaster as ChakraToaster,
  Box,
  HStack,
  Portal,
  Stack,
  Text,
  Toast,
  createToaster,
} from "@chakra-ui/react";
import { chatTime, senderNameColor, senderPalette, type ChatEntry } from "@/lib/chat";
import { RollCard, SenderAvatar } from "./play-chat-entry";
import { PlayChatInput } from "./play-chat-input";
import { PlayChatLayoutPicker } from "./play-chat-layout";
import type { StoryChat } from "./use-story-chat";

type Props = {
  /** The box's id, which the header's Chat toggle points at. */
  id: string;
  idStory: number;
  chat: StoryChat;
  /**
   * Whether the box to type in shows. The display table (/table/[id]) leaves
   * it out for a guest, who reads the table's lines but has no account to
   * speak with.
   */
  canPost?: boolean;
  /** Whether the layout picker shows; the display table has no other layout to pick. */
  showLayoutPicker?: boolean;
};

// How long a line stays over the table.
const SHOWN_FOR = 10_000;

// Its own store, so the table's lines stack by themselves above the box,
// apart from the app's toasts, and can all go when the overlay does.
const chatToaster = createToaster({
  placement: "bottom-end",
  overlap: false,
  max: 8,
  offsets: { top: "1rem", right: "1rem", bottom: "5.5rem", left: "1rem" },
});

// The overlay chat: no panel, a small box in the lower right to type in,
// with the layout picker beside it, and each line said while it is up shown
// above the box for ten seconds, quietly, the newest at the foot. Lines
// pile up rather than replace each other, and go on their own.
//
// A line is shown once, when it is first held: what the chat's first page
// brought, what was already held when the overlay opened, and older lines,
// are not. Edits and
// rolls arrive the same way as any line; a taken-back line leaves its toast
// at once.
export function PlayChatOverlay({
  id,
  idStory,
  chat,
  canPost = true,
  showLayoutPicker = true,
}: Props) {
  const { entries, loaded } = chat;
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
    for (const entry of entries) {
      if (entry.idChat <= shownUpTo.current) continue;
      chatToaster.create({ id: `chat-${entry.idChat}`, duration: SHOWN_FOR, meta: { entry } });
    }
    shownUpTo.current = Math.max(shownUpTo.current, newestId);
    // A line taken back leaves the overlay too.
    const held = new Set(entries.map((entry) => `chat-${entry.idChat}`));
    for (const toast of chatToaster.getVisibleToasts()) {
      if (toast.id && !held.has(toast.id)) chatToaster.dismiss(toast.id);
    }
  }, [entries, loaded]);

  // Leaving the overlay takes its lines with it.
  useEffect(() => () => chatToaster.remove(), []);

  return (
    <>
      <Portal>
        <ChakraToaster toaster={chatToaster} insetInline={{ mdDown: "4" }}>
          {(toast) => (
            <Toast.Root
              width={{ md: "sm" }}
              py="2"
              px="3"
              bg="bg.panel/75"
              color="fg"
              borderWidth="1px"
              shadow="sm"
              backdropFilter="blur(6px)"
            >
              <ChatToastLine entry={(toast.meta as { entry: ChatEntry }).entry} />
            </Toast.Root>
          )}
        </ChakraToaster>
      </Portal>

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
