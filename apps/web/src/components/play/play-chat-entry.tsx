"use client";

import { useState } from "react";
import {
  Avatar,
  Box,
  HStack,
  IconButton,
  Portal,
  Separator,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Pencil } from "lucide-react";
import { useUser } from "@/components/auth/user-provider";
import {
  chatTime,
  inkOn,
  senderInitials,
  senderNameColor,
  senderPalette,
  type ChatEntry,
} from "@/lib/chat";
import type { PublicChat } from "@/lib/realtime/chat-events";
import { PlayChatDelete } from "./play-chat-delete";
import { PlayChatEdit } from "./play-chat-edit";

type Props = {
  entry: ChatEntry;
  idStory: number;
  /** A line of the viewer's own, as its edit saved it. */
  onEdited: (chat: PublicChat) => void;
  /** A line of the viewer's own, taken back. */
  onDeleted: (idChat: number) => void;
  /** The compact layout: no picture, smaller buttons, and every font a size down. */
  compact?: boolean;
};

// One line of the table chat: the sender's picture and name in their own
// colour, the time, then what they said or rolled. No bubble round the
// text, so a long exchange reads as a conversation rather than a stack of
// cards; a roll gets its card because it is not prose, and is never
// rewritten, since its dice are what was rolled. A line the table
// put there itself has no sender to show: moving to a scene is a rule
// across the chat with the scene's name in it, and anything else a muted
// line in the column the text takes.
//
// The picture and colour are the sender's profile's; without a picture the
// avatar shows their initials, and without a colour the avatar and name
// take a palette keyed off their name, so each person still keeps one.
//
// The viewer's own lines carry a pencil at the end of the name's line,
// which turns the text into a field to rewrite it in (PlayChatEdit), and a
// bin beside it that takes the line back once a popover has asked
// (PlayChatDelete); a line that has been rewritten says "edited" there, for
// everyone.
//
// Compact leaves the picture out, takes every font a size down and the
// pencil and bin with them, so more of the conversation fits the panel; the
// name, in its colour, still says who spoke.
export function PlayChatEntry({ entry, idStory, onEdited, onDeleted, compact = false }: Props) {
  const user = useUser();
  const [editing, setEditing] = useState(false);
  const palette = senderPalette(entry.from);
  // Worked out in the browser, where every line is loaded, so the server's
  // clock and time zone never come into it.
  const time = chatTime(entry.createdAt);

  if (entry.kind === "scene") {
    return (
      <HStack as="article" gap="3" aria-label={entry.text}>
        <Separator flex="1" />
        <Text textStyle="xs" color="fg.muted" fontWeight="bold">
          {entry.text}
        </Text>
        <Text textStyle="xs" color="fg.subtle">
          {time}
        </Text>
        <Separator flex="1" />
      </HStack>
    );
  }

  if (entry.kind === "system") {
    return (
      <HStack as="article" gap="2" align="baseline" ps={compact ? "0" : "12"}>
        <Text textStyle={compact ? "xs" : "sm"} color="fg.muted" fontStyle="italic">
          {entry.text}
        </Text>
        <Text textStyle="xs" color="fg.subtle">
          {time}
        </Text>
      </HStack>
    );
  }

  const isMine = entry.kind === "text" && entry.idUser === user.id;

  const head = (
    <HStack gap="2" align={compact ? "center" : "baseline"}>
      <Text
        textStyle={compact ? "sm" : undefined}
        colorPalette={palette}
        color={entry.color ? senderNameColor(entry.color) : "colorPalette.fg"}
        fontWeight="bold"
      >
        {entry.from}
      </Text>
      <Text textStyle={compact ? "2xs" : "xs"} color="fg.muted">
        {time}
      </Text>
      <Box flex="1" />
      {entry.isEdited && (
        <Text textStyle="xs" color="fg.subtle" fontStyle="italic">
          edited
        </Text>
      )}
      {isMine && !editing && (
        <>
          <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>
              <IconButton
                aria-label="Edit message"
                variant="ghost"
                size="2xs"
                boxSize={compact ? "5" : undefined}
                minW={compact ? "5" : undefined}
                color="fg.muted"
                alignSelf="center"
                _icon={compact ? { boxSize: "3" } : undefined}
                onClick={() => setEditing(true)}
              >
                <Pencil />
              </IconButton>
            </Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>Edit message</Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
          <PlayChatDelete
            idStory={idStory}
            idChat={entry.idChat}
            onDeleted={onDeleted}
            small={compact}
          />
        </>
      )}
    </HStack>
  );

  const body =
    entry.kind === "text" ? (
      editing ? (
        <PlayChatEdit
          idStory={idStory}
          idChat={entry.idChat}
          text={entry.text}
          onDone={(chat) => {
            if (chat) onEdited(chat);
            setEditing(false);
          }}
        />
      ) : (
        <Text textStyle={compact ? "sm" : undefined}>{entry.text}</Text>
      )
    ) : (
      <RollCard entry={entry} compact={compact} />
    );

  if (compact) {
    return (
      <Stack as="article" gap="0.5" minW="0" pt="1">
        {head}
        {body}
      </Stack>
    );
  }

  return (
    <HStack as="article" align="start" gap="3">
      <SenderAvatar entry={entry} size="sm" />
      <Stack gap="1" minW="0" flex="1">
        {head}
        {body}
      </Stack>
    </HStack>
  );
}

/**
 * The sender's picture, or their initials on their colour (or, with no
 * colour, a palette keyed off their name).
 */
export function SenderAvatar({
  entry,
  size,
}: {
  entry: Extract<ChatEntry, { kind: "text" | "roll" }>;
  size: "2xs" | "xs" | "sm";
}) {
  return (
    <Avatar.Root
      size={size}
      colorPalette={senderPalette(entry.from)}
      variant="solid"
      flexShrink="0"
      bg={entry.color ?? undefined}
      color={entry.color ? inkOn(entry.color) : undefined}
    >
      <Avatar.Fallback>{senderInitials(entry.from)}</Avatar.Fallback>
      {entry.picture && <Avatar.Image src={entry.picture} alt="" />}
    </Avatar.Root>
  );
}

/**
 * A /roll: the total and what it was for, as the table reads it ("6 for
 * initiative"), then each die as it landed, a die the notation dropped
 * dimmed and struck through, then the roll written out in full.
 */
export function RollCard({
  entry,
  compact = false,
}: {
  entry: Extract<ChatEntry, { kind: "roll" }>;
  compact?: boolean;
}) {
  const { roll } = entry;
  const label = roll.label ? ` ${roll.label}` : "";

  return (
    <Stack
      role="group"
      gap={compact ? "1" : "2"}
      p={compact ? "2" : "3"}
      borderWidth="1px"
      rounded="lg"
      bg="bg.subtle"
      aria-label={`Rolled ${roll.notation}${label}: ${roll.total}`}
    >
      <Text textStyle={compact ? "md" : "lg"} fontWeight="bold">
        {entry.text}
      </Text>
      <HStack gap={compact ? "1" : "2"} wrap="wrap">
        {roll.dice.map((die, i) => (
          <Box
            key={i}
            data-testid="die"
            data-dropped={die.dropped || undefined}
            minW={compact ? "6" : "8"}
            h={compact ? "6" : "8"}
            px="1"
            display="grid"
            placeItems="center"
            borderWidth="1px"
            rounded="md"
            bg="bg.panel"
            textStyle={compact ? "sm" : undefined}
            fontFamily="mono"
            fontWeight="bold"
            opacity={die.dropped ? 0.5 : undefined}
            textDecoration={die.dropped ? "line-through" : undefined}
          >
            {die.value}
          </Box>
        ))}
      </HStack>
      <Text textStyle="xs" color="fg.muted" fontFamily="mono">
        {roll.detail}
      </Text>
    </Stack>
  );
}
