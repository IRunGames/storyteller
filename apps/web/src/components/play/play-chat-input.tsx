"use client";

import { useState } from "react";
import { Button, Field, HStack, IconButton, Input } from "@chakra-ui/react";
import { SendHorizontal } from "lucide-react";
import { useUser } from "@/components/auth/user-provider";
import { parseChatCommand } from "@/lib/chat-commands";
import { sa_postChat } from "@/app/(app)/play/[id]/actions";
import type { StoryChat } from "./use-story-chat";

type Props = {
  idStory: number;
  chat: StoryChat;
  /** The overlay's box: a smaller field and an icon-only Send. */
  small?: boolean;
};

// Where a line is typed, at the foot of the chat panel or in the overlay's
// box. Enter sends, being the form's submit, and so does Send; what is sent
// goes into the table's chat at once (merge), ahead of its copy on the
// topic. A mistyped command is refused here, where it was typed, rather
// than after a round trip; sa_postChat reads it again and does the
// rolling. A refusal keeps the text so it can be put right and sent again.
//
// The up arrow in an empty input brings back the last message sent from
// here, as typed (a /roll comes back as its command, not as the total the
// chat shows for it), else the viewer's last said line in the chat; a draft
// is left alone.
export function PlayChatInput({ idStory, chat, small = false }: Props) {
  const { entries, merge } = chat;
  const user = useUser();
  const [input, setInput] = useState("");
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const command = parseChatCommand(text);
    if (command && !command.ok) {
      setError(command.error);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await sa_postChat(idStory, text);
      if (result.ok) {
        merge(result.chat);
        setLastSent(text);
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
    <HStack asChild gap="2" align="start" flex="1" minW="0">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Field.Root invalid={error !== null}>
          <Input
            aria-label="Message"
            placeholder="Say something, or /roll 2d6"
            size={small ? "sm" : undefined}
            value={input}
            readOnly={sending}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" || input !== "") return;
              const recalled =
                lastSent ??
                entries.findLast((entry) => entry.kind === "text" && entry.idUser === user.id)
                  ?.text;
              if (!recalled) return;
              e.preventDefault();
              setInput(recalled);
              setError(null);
            }}
            autoComplete="off"
          />
          {error && <Field.ErrorText>{error}</Field.ErrorText>}
        </Field.Root>
        {small ? (
          <IconButton type="submit" aria-label="Send" size="sm" flexShrink="0" loading={sending}>
            <SendHorizontal />
          </IconButton>
        ) : (
          <Button type="submit" flexShrink="0" loading={sending}>
            <SendHorizontal />
            Send
          </Button>
        )}
      </form>
    </HStack>
  );
}
