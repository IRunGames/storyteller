"use client";

import {
  Badge,
  Box,
  Button,
  chakra,
  Code,
  Collapsible,
  Flex,
  Heading,
  HStack,
  Stack,
  Text,
} from "@chakra-ui/react";
import { ChevronRight } from "lucide-react";
import type { ChannelState, ChannelStatus } from "./use-story-channel";

type Props = {
  /** The panel's id, which the header's Diagnostics toggle points at. */
  id: string;
  channel: ChannelState;
};

const STATUS_PALETTE: Record<ChannelStatus, string> = {
  connecting: "gray",
  connected: "green",
  reconnecting: "orange",
  offline: "red",
  unavailable: "gray",
};

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * The diagnostics panel, in the chat's place for storytellers and
 * administrators (lib/diagnostics.ts): the broker connection, what the
 * table is subscribed to, and every message that came over it, newest
 * first, each a line with its time and what it is about that opens to the
 * payload. A tool for seeing the storyteller's changes arrive, which is why
 * the raw JSON is shown rather than anything prettier.
 */
export function PlayDiagnostics({ id, channel }: Props) {
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
          Diagnostics
        </Heading>
        <Badge
          colorPalette={STATUS_PALETTE[channel.status]}
          variant="subtle"
          rounded="full"
          size="lg"
        >
          {channel.status}
        </Badge>
      </HStack>

      <Stack gap="1" px="4" py="3" borderBottomWidth="1px" fontSize="sm">
        <HStack gap="2" align="baseline">
          <Text color="fg.muted" flexShrink="0">
            Broker
          </Text>
          <Code fontSize="xs" truncate>
            {channel.url ?? "—"}
          </Code>
        </HStack>
        <HStack gap="2" align="baseline">
          <Text color="fg.muted" flexShrink="0">
            Subscribed
          </Text>
          {/* Only the state topic so far; listed, so the panel is ready for
              chat and the per-player topic when they come. */}
          <Code fontSize="xs" truncate>
            {channel.topic ?? "—"}
          </Code>
        </HStack>
        {channel.error && (
          <Text color="fg.error" role="alert">
            {channel.error}
          </Text>
        )}
      </Stack>

      <HStack justify="space-between" gap="2" px="4" py="2">
        <Text fontSize="sm" color="fg.muted">
          {channel.messages.length === 1 ? "1 message" : `${channel.messages.length} messages`}
        </Text>
        <Button size="xs" variant="ghost" onClick={channel.clear}>
          Clear
        </Button>
      </HStack>

      <Box flex="1" minH="0" overflowY="auto" px="2" pb="3">
        <Stack as="ol" listStyleType="none" gap="1" m="0" p="0">
          {channel.messages.map((message) => (
            <Collapsible.Root key={message.id} as="li">
              <Collapsible.Trigger asChild>
                <chakra.button
                  type="button"
                  display="flex"
                  alignItems="center"
                  w="full"
                  gap="2"
                  px="2"
                  py="1"
                  rounded="md"
                  textAlign="start"
                  cursor="pointer"
                  _hover={{ bg: "bg.subtle" }}
                  // Not one of ours: still listed, but marked, since the
                  // topic can carry anything the broker lets through.
                  color={message.known ? undefined : "fg.muted"}
                  aria-label={`${timeFormat.format(message.at)} ${message.title}`}
                >
                  <Box
                    as="span"
                    flexShrink="0"
                    display="inline-flex"
                    css={{ "[data-state=open] > &": { transform: "rotate(90deg)" } }}
                    aria-hidden
                  >
                    <ChevronRight size={14} />
                  </Box>
                  <Text as="span" fontSize="xs" color="fg.muted" flexShrink="0" fontFamily="mono">
                    {timeFormat.format(message.at)}
                  </Text>
                  <Text as="span" fontSize="sm" truncate>
                    {message.title}
                  </Text>
                </chakra.button>
              </Collapsible.Trigger>
              <Collapsible.Content>
                <Box
                  as="pre"
                  mx="2"
                  mb="2"
                  p="2"
                  fontSize="xs"
                  fontFamily="mono"
                  whiteSpace="pre-wrap"
                  wordBreak="break-all"
                  bg="bg.subtle"
                  rounded="md"
                >
                  {typeof message.payload === "string"
                    ? message.payload
                    : JSON.stringify(message.payload, null, 2)}
                </Box>
              </Collapsible.Content>
            </Collapsible.Root>
          ))}
        </Stack>
      </Box>
    </Flex>
  );
}
