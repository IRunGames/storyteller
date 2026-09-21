"use client";

import { useEffect, useState, useRef } from "react";
import {
  Avatar,
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  IconButton,
  Input,
  Text,
  Wrap,
} from "@chakra-ui/react";
import { useUser } from "@/components/auth/user-provider";
import { Send } from "lucide-react";
import { ColorModeButton } from "@/components/ui/color-mode";
import { SignOutButton } from "@/components/auth/sign-out-button";

interface ChatMessage {
  userId: string;
  text: string;
  timestamp: number;
}

export default function Home() {
  const user = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // TODO: populate from the messaging service's presence feed.
  const [users] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    // TODO: deliver through the messaging service.
    setMessages((prev) => [
      ...prev,
      { userId: user.id, text: input, timestamp: Date.now() },
    ]);
    setInput("");
  };

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
            <Avatar.Fallback name={user.name} />
            <Avatar.Image src={user.image ?? undefined} />
          </Avatar.Root>
          <Text textStyle="sm">{user.name}</Text>
        </HStack>
        <ColorModeButton />
        <SignOutButton />
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
          <Send />
        </IconButton>
      </HStack>
    </Flex>
  );
}
