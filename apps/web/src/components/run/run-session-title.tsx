"use client";

import { useRef, useState } from "react";
import { chakra, Input } from "@chakra-ui/react";
import type { RunSession } from "@/lib/run";
import { sessionHeading } from "@/lib/stories";
import { sa_setSessionTitle } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStory: number;
  session: RunSession;
};

/**
 * The session in the run page's header, renamed in place: pressing the
 * heading swaps it for an input holding the title alone, without the number,
 * which is the session's place in the story and not the storyteller's to
 * type. Enter or leaving the field saves (sa_setSessionTitle); Escape puts
 * it back as it was. An empty title clears it, and the heading goes back to
 * "Session 3".
 *
 * The heading changes at once and goes back, with a toast, if the action
 * refuses: there is no form here to hold an inline error, as the pill's
 * dropdown has none either.
 */
export function RunSessionTitle({ idStory, session }: Props) {
  const [title, setTitle] = useState(session.title);
  const [draft, setDraft] = useState<string | null>(null);
  // Enter saves and then unmounts the input, which can blur it as it goes;
  // this keeps that blur from saving a second time.
  const settled = useRef(false);

  const heading = sessionHeading({ number: session.number, title });

  function startEditing() {
    settled.current = false;
    setDraft(title ?? "");
  }

  async function save() {
    if (settled.current || draft === null) return;
    settled.current = true;
    const next = draft.trim() || null;
    setDraft(null);
    if (next === title) return;

    const before = title;
    setTitle(next);
    try {
      const result = await sa_setSessionTitle(idStory, session.idStorySession, next ?? "");
      if (result.ok) {
        setTitle(result.title);
        return;
      }
      setTitle(before);
      toaster.create({ title: result.error, type: "error" });
    } catch {
      setTitle(before);
      toaster.create({ title: "The title could not be saved. Try again.", type: "error" });
    }
  }

  function cancel() {
    settled.current = true;
    setDraft(null);
  }

  if (draft !== null) {
    return (
      <Input
        size="sm"
        minW="40"
        aria-label="Session title"
        placeholder={`Session ${session.number}`}
        value={draft}
        maxLength={200}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          else if (event.key === "Escape") cancel();
        }}
      />
    );
  }

  return (
    // The header's own session text, made a button: the same size and
    // truncation, with a hover underline so it reads as something to press.
    <chakra.button
      type="button"
      textStyle="lg"
      minW="0"
      maxW="full"
      truncate
      cursor="text"
      rounded="sm"
      title={heading}
      aria-label={`${heading}, rename the session`}
      _hover={{ textDecoration: "underline", textDecorationStyle: "dotted" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
      onClick={startEditing}
    >
      {heading}
    </chakra.button>
  );
}
