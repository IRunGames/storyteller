"use client";

import { useState } from "react";
import {
  Avatar,
  Badge,
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
import { PlayChatEdit } from "./play-chat-edit";

type Props = {
  entry: ChatEntry;
  /** Sample lines are drawn muted, so they read as what the chat will hold. */
  isSample?: boolean;
  idStory: number;
  /** A line of the viewer's own, as its edit saved it. */
  onEdited: (chat: PublicChat) => void;
};

// One line of the table chat: the sender's picture and name in their own
// colour, the time, then what they said or rolled. No bubble round the
// text, so a long exchange reads as a conversation rather than a stack of
// cards; a roll gets its card because it is not prose. A line the table
// put there itself has no sender to show: moving to a scene is a rule
// across the chat with the scene's name in it, and anything else a muted
// line in the column the text takes.
//
// The picture and colour are the sender's profile's; without a picture the
// avatar shows their initials, and without a colour the avatar and name
// take a palette keyed off their name, so each person still keeps one.
//
// The viewer's own lines carry a pencil at the end of the name's line,
// which turns the text into a field to rewrite it in (PlayChatEdit); a line
// that has been rewritten says "edited" there, for everyone.
export function PlayChatEntry({ entry, isSample = false, idStory, onEdited }: Props) {
  const user = useUser();
  const [editing, setEditing] = useState(false);
  const palette = senderPalette(entry.from);
  // The sample's fixed label, else worked out from when it was said. Only
  // a saved line gets here without a label, and those are loaded in the
  // browser, so the server never works one out.
  const time = entry.time ?? chatTime(entry.createdAt);

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
      <HStack as="article" gap="2" align="baseline" ps="12">
        <Text textStyle="sm" color="fg.muted" fontStyle="italic">
          {entry.text}
        </Text>
        <Text textStyle="xs" color="fg.subtle">
          {time}
        </Text>
      </HStack>
    );
  }

  const isMine =
    !isSample && entry.kind === "text" && entry.idChat !== null && entry.idUser === user.id;

  return (
    <HStack as="article" align="start" gap="3" opacity={isSample ? 0.75 : undefined}>
      <Avatar.Root
        size="sm"
        colorPalette={palette}
        variant="solid"
        flexShrink="0"
        bg={entry.color ?? undefined}
        color={entry.color ? inkOn(entry.color) : undefined}
      >
        <Avatar.Fallback>{senderInitials(entry.from)}</Avatar.Fallback>
        {entry.picture && <Avatar.Image src={entry.picture} alt="" />}
      </Avatar.Root>
      <Stack gap="1" minW="0" flex="1">
        <HStack gap="2" align="baseline">
          <Text
            colorPalette={palette}
            color={entry.color ? senderNameColor(entry.color) : "colorPalette.fg"}
            fontWeight="bold"
          >
            {entry.from}
          </Text>
          <Text textStyle="xs" color="fg.muted">
            {time}
          </Text>
          <Box flex="1" />
          {entry.isEdited && (
            <Text textStyle="xs" color="fg.subtle" fontStyle="italic">
              edited
            </Text>
          )}
          {isMine && !editing && (
            <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
              <Tooltip.Trigger asChild>
                <IconButton
                  aria-label="Edit message"
                  variant="ghost"
                  size="2xs"
                  color="fg.muted"
                  alignSelf="center"
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
          )}
        </HStack>
        {entry.kind === "text" ? (
          editing && entry.idChat !== null ? (
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
            <Text>{entry.text}</Text>
          )
        ) : (
          <RollCard roll={entry} />
        )}
      </Stack>
    </HStack>
  );
}

function RollCard({ roll }: { roll: Extract<ChatEntry, { kind: "roll" }> }) {
  const success = roll.outcome === "SUCCESS";

  return (
    <Stack
      gap="2"
      p="3"
      borderWidth="1px"
      rounded="lg"
      bg="bg.subtle"
      aria-label={`Rolled ${roll.formula} for ${roll.label}: ${roll.total}, ${roll.outcome.toLowerCase()}`}
    >
      <HStack gap="2" wrap="wrap">
        {roll.dice.map((die, i) => (
          <Box
            key={i}
            minW="8"
            h="8"
            display="grid"
            placeItems="center"
            borderWidth="1px"
            rounded="md"
            bg="bg.panel"
            fontFamily="mono"
            fontWeight="bold"
          >
            {die}
          </Box>
        ))}
        {roll.modifier && (
          <Badge colorPalette="orange" variant="subtle" rounded="full">
            {roll.modifier.value >= 0 ? "+" : ""}
            {roll.modifier.value} {roll.modifier.label}
          </Badge>
        )}
      </HStack>
      <Text alignSelf="end" fontFamily="mono" fontWeight="bold">
        = {roll.total}
      </Text>
      <HStack gap="2" justify="space-between" wrap="wrap">
        <Text textStyle="xs" color="fg.muted">
          {roll.formula} · {roll.label}
        </Text>
        <Badge
          colorPalette={success ? "green" : "red"}
          variant="subtle"
          rounded="full"
          letterSpacing="wider"
        >
          {roll.outcome}
        </Badge>
      </HStack>
    </Stack>
  );
}
