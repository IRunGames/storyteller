"use client";

import { useState } from "react";
import { Button, Field, HStack, Textarea } from "@chakra-ui/react";
import { sa_setPlayElementNotes } from "@/app/(app)/play/[id]/actions";

type Props = {
  idStory: number;
  idElement: number;
  /** The notes as the table holds them, or null for none. */
  notes: string | null;
  /** The notes have been saved from here, as stored: null for none. */
  onSaved: (notes: string | null) => void;
};

/**
 * The Notes field in a pill's info popover on the players' table: the
 * players' own notes on the element, written as the scene is played, with
 * a Save under it (sa_setPlayElementNotes). Save does nothing until the
 * text differs from what is held, trimmed as the action trims it, and goes
 * quiet again once saved, so the button itself says whether there is
 * anything to keep. A refusal stays under the field, with the text as
 * typed, for the player to fix. What was saved is reported, so the table
 * shows it before the topic says the element changed.
 */
export function PlayElementNotesField({ idStory, idElement, notes, onSaved }: Props) {
  const [value, setValue] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = value.trim() !== (notes ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await sa_setPlayElementNotes(idStory, idElement, value);
      if (result.ok) onSaved(result.notes);
      else setError(result.error);
    } catch {
      setError("The notes could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Field.Root invalid={error !== null}>
      <Field.Label>Notes</Field.Label>
      <Textarea
        size="sm"
        rows={4}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
      />
      <Field.ErrorText>{error}</Field.ErrorText>
      <HStack justify="flex-end" w="full">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={!changed}
          loading={saving}
          onClick={() => void save()}
        >
          Save notes
        </Button>
      </HStack>
    </Field.Root>
  );
}
