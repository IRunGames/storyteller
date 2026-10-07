"use client";

import { Avatar, Badge, Box, HStack, Stack, Text } from "@chakra-ui/react";
import { senderInitials, senderPalette, type ChatEntry } from "@/lib/chat";

type Props = {
  entry: ChatEntry;
  /** Sample lines are drawn muted, so they read as what the chat will hold. */
  isSample?: boolean;
};

// One line of the table chat: the sender's initials and name in their own
// colour, the time, then what they said or rolled. No bubble round the
// text, so a long exchange reads as a conversation rather than a stack of
// cards; a roll gets its card because it is not prose.
export function PlayChatEntry({ entry, isSample = false }: Props) {
  const palette = senderPalette(entry.from);

  return (
    <HStack as="article" align="start" gap="3" opacity={isSample ? 0.75 : undefined}>
      <Avatar.Root size="sm" colorPalette={palette} variant="solid" flexShrink="0">
        <Avatar.Fallback>{senderInitials(entry.from)}</Avatar.Fallback>
      </Avatar.Root>
      <Stack gap="1" minW="0" flex="1">
        <HStack gap="2" align="baseline">
          <Text colorPalette={palette} color="colorPalette.fg" fontWeight="bold">
            {entry.from}
          </Text>
          <Text textStyle="xs" color="fg.muted">
            {entry.time}
          </Text>
        </HStack>
        {entry.kind === "text" ? <Text>{entry.text}</Text> : <RollCard roll={entry} />}
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
