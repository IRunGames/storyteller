"use client";

import { useState } from "react";
import { Editable, Text, type EditableRootProps } from "@chakra-ui/react";

type Props = {
  /** The accessible name of the field while it is being edited. */
  label: string;
  value: string;
  placeholder: string;
  /** A bio takes several lines; Enter starts a new one and Cmd/Ctrl+Enter saves. */
  multiline?: boolean;
  /**
   * Saves the new value. Resolves to null when it was saved, or to the
   * message to show when it was refused, in which case the field goes back
   * to what it held before.
   */
  onSave: (value: string) => Promise<string | null>;
} & Pick<EditableRootProps, "fontSize" | "fontWeight" | "fontStyle" | "color">;

/**
 * One of the profile card's click-to-edit fields: the text as it reads, which
 * turns into an input when clicked and saves on Enter or on leaving it.
 * Escape puts the text back unsaved. The draft is the field's own state so
 * typing does not reach the card until the edit is committed.
 */
export function ProfileEditable({
  label,
  value,
  placeholder,
  multiline = false,
  onSave,
  ...style
}: Props) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function commit(next: string) {
    if (next === value) return;
    setSaving(true);
    setError(null);
    const refused = await onSave(next);
    setSaving(false);
    if (refused) {
      setError(refused);
      setDraft(value);
    }
  }

  return (
    <>
      <Editable.Root
        value={draft}
        onValueChange={(details) => setDraft(details.value)}
        onValueCommit={(details) => void commit(details.value)}
        onValueRevert={() => setDraft(value)}
        placeholder={placeholder}
        disabled={saving}
        // Leaving the field saves it, as the profile has no Save button.
        submitMode="both"
        activationMode="click"
        {...style}
      >
        <Editable.Preview
          w="full"
          whiteSpace="pre-wrap"
          alignItems="flex-start"
          // The placeholder is a prompt, set apart from text the user wrote.
          css={{ "&[data-placeholder-shown]": { color: "fg.muted", fontStyle: "italic" } }}
        />
        {multiline ? (
          <Editable.Textarea aria-label={label} minH="24" />
        ) : (
          <Editable.Input aria-label={label} />
        )}
      </Editable.Root>
      {error && (
        <Text role="alert" textStyle="sm" color="fg.error">
          {error}
        </Text>
      )}
    </>
  );
}
