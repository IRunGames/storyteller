"use client";

import { useState } from "react";
import { Field, Input } from "@chakra-ui/react";
import type { PublicChat } from "@/lib/realtime/chat-events";
import { sa_editChat } from "@/app/(app)/play/[id]/actions";

type Props = {
  idStory: number;
  idChat: number;
  /** The line as it stands, which the input starts from and Esc puts back. */
  text: string;
  /** Editing is over: with the line as saved, or null when nothing was saved. */
  onDone: (chat: PublicChat | null) => void;
};

/**
 * A line of the viewer's own, rewritten in place of its text. Enter saves
 * (sa_editChat) and Esc puts it back as it was; a line that comes back
 * unchanged is closed without a save. Leaving the field does neither, so
 * nothing typed is lost to a stray click. A refusal stays in the field with
 * the reason beneath it.
 */
export function PlayChatEdit({ idStory, idChat, text, onDone }: Props) {
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    if (draft.trim() === text) {
      onDone(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await sa_editChat(idStory, idChat, draft);
      if (result.ok) {
        onDone(result.chat);
        return;
      }
      setError(result.error);
    } catch {
      setError("The message could not be saved. Try again.");
    }
    setSaving(false);
  }

  return (
    <Field.Root invalid={error !== null}>
      <Input
        aria-label="Edit message"
        size="sm"
        value={draft}
        readOnly={saving}
        autoFocus
        autoComplete="off"
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          else if (e.key === "Escape") onDone(null);
        }}
      />
      {error && <Field.ErrorText>{error}</Field.ErrorText>}
    </Field.Root>
  );
}
