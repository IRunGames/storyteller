"use client";

import { useEffect, useState, useRef } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  IconButton,
  Input,
  Spinner,
  Text,
  VStack,
  Wrap,
} from "@chakra-ui/react";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { ColorModeButton } from "@/components/ui/color-mode";

interface ChatMessage {
  userId: string;
  text: string;
  timestamp: number;
}

function SendIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

export default function Home() {
  const { data: session, isPending } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // TODO: populate from the messaging service's presence feed.
  const [users] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || !session) return;
    // TODO: deliver through the messaging service.
    setMessages((prev) => [
      ...prev,
      { userId: session.user.id, text: input, timestamp: Date.now() },
    ]);
    setInput("");
  };

  if (isPending) {
    return (
      <Flex h="100vh" align="center" justify="center">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!session) {
    return (
      <VStack h="100vh" justify="center" gap="4">
        <Heading size="3xl">Storyteller</Heading>
        <Text color="fg.muted">Sign in to start your adventure</Text>
        <Button
          onClick={() =>
            signIn.social({ provider: "google", callbackURL: "/" })
          }
        >
          Sign in with Google
        </Button>
        <ColorModeButton />
      </VStack>
    );
  }

  return (
    <Flex direction="column" h="100vh">
      <HStack
        as="header"
        gap="4"
        minH="16"
        px="4"
        borderBottomWidth="1px"
        bg="bg.subtle"
      >
        <Heading size="lg" flexGrow="1">
          Storyteller
        </Heading>
        <HStack gap="2">
          <Avatar.Root size="xs">
            <Avatar.Fallback name={session.user.name} />
            <Avatar.Image src={session.user.image ?? undefined} />
          </Avatar.Root>
          <Text textStyle="sm">{session.user.name}</Text>
        </HStack>
        <ColorModeButton />
        <Button variant="ghost" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </HStack>

      {/* Users online */}
      {users.length > 0 && (
        <Wrap gap="2" px="4" py="2">
          {users.map((u) => (
            <Badge key={u} variant="outline">
              {u.slice(0, 8)}
            </Badge>
          ))}
        </Wrap>
      )}

      {/* Messages */}
      <Box flex="1" overflowY="auto" px="4" py="2">
        {messages.map((msg, i) => (
          <Box
            key={i}
            as="article"
            maxW="80%"
            mb="2"
            px="4"
            py="2"
            borderWidth="1px"
            rounded="md"
            bg="bg.panel"
          >
            <Text textStyle="xs" color="fg.muted">
              {msg.userId.slice(0, 8)}
            </Text>
            <Text>{msg.text}</Text>
          </Box>
        ))}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <HStack gap="2" p="4" borderTopWidth="1px">
        <Input
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          autoComplete="off"
        />
        <IconButton
          onClick={sendMessage}
          disabled={!input.trim()}
          aria-label="Send message"
          variant="ghost"
          rounded="full"
        >
          <SendIcon />
        </IconButton>
      </HStack>
    </Flex>
  );
}
