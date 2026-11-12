"use client";

import { useState, type KeyboardEvent } from "react";
import { HStack, Stack, Text } from "@chakra-ui/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { NumberOnlyInput } from "./number-only-input";

type Props = {
  /** The accessible name of the box; the clickers are "<label> up" and "<label> down". */
  label: string;
  value: number | null;
  /** Drawn before the box when given: the sign a signed format shows. */
  sign?: "+" | "−";
  /** Without it the box is read-only and the clickers are not drawn. */
  canEdit: boolean;
  /** Whether the up/down clicker is drawn beside the box, as the template says (`upDown`). */
  clicker: boolean;
  /** The floor and ceiling a step keeps to, a pool's or stack's; left out, a step is unbounded. */
  min?: number;
  max?: number | null;
  onCommit: (value: number) => void;
  testId?: string;
};

/**
 * A number at the table: an entry box with an up/down clicker beside it
 * where the template asks for one. The arrow keys in the box step the value
 * the same way, and a step keeps to the min and max given, so a pool is not
 * stepped past its ceiling only to come back clamped. A click or a step
 * commits at once, from the value shown; typing commits when the box
 * is left or Enter is pressed, and anything that is not a number by then
 * is dropped and the value shown comes back. What is shown is the value
 * given until something is typed, so a value that comes back clamped from
 * the action replaces the typing rather than fighting it.
 */
export function StatNumber({
  label,
  value,
  sign,
  canEdit,
  clicker,
  min,
  max,
  onCommit,
  testId,
}: Props) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? (value === null ? "" : String(value));
  const current = value ?? 0;

  // A step from the value shown, held to the floor and ceiling given; at
  // either end there is nothing to commit.
  function step(by: 1 | -1) {
    let next = current + by;
    if (typeof min === "number") next = Math.max(min, next);
    if (typeof max === "number") next = Math.min(max, next);
    if (next !== current) onCommit(next);
  }

  function commitTyped() {
    if (typed === null) return;
    const number = Number(typed);
    setTyped(null);
    if (typed.trim() !== "" && Number.isFinite(number) && number !== value) onCommit(number);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTyped();
    } else if (event.key === "Escape") {
      setTyped(null);
    } else if (canEdit && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      // The arrows step the value as the clicker does, whatever is half typed.
      event.preventDefault();
      setTyped(null);
      step(event.key === "ArrowUp" ? 1 : -1);
    }
  }

  return (
    <HStack gap="1">
      {sign && (
        <Text as="span" fontWeight="semibold" aria-hidden>
          {sign}
        </Text>
      )}
      <NumberOnlyInput
        size="xs"
        // Room for three digits and no more, so a line holds more stats.
        w="12"
        textAlign="right"
        aria-label={label}
        value={shown}
        readOnly={!canEdit}
        data-testid={testId}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commitTyped}
        onKeyDown={onKeyDown}
      />
      {canEdit && clicker && (
        <Stack gap="0">
          <PrepIconButton label={`${label} up`} size="2xs" onClick={() => step(1)}>
            <ChevronUp />
          </PrepIconButton>
          <PrepIconButton label={`${label} down`} size="2xs" onClick={() => step(-1)}>
            <ChevronDown />
          </PrepIconButton>
        </Stack>
      )}
    </HStack>
  );
}
