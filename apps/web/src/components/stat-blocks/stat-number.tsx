"use client";

import { useState, type KeyboardEvent } from "react";
import { HStack, NumberInput, Stack, Text } from "@chakra-ui/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { numberOnly } from "@/lib/stat-blocks";

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
 * A number at the table: Chakra's NumberInput as the entry box, with an
 * up/down clicker beside it where the template asks for one. The box
 * announces itself as a spinbutton with its bounds, and keeps what is typed
 * to a number: zag refuses any other character as it is typed, from the
 * beforeinput event, and numberOnly cuts it again from the change, since
 * jsdom delivers no beforeinput data and a paste's is only partly checked.
 *
 * The steps are this component's own rather than the NumberInput's
 * triggers and arrow keys: the table commits every step at once, from the
 * value stored, and holds it to the min and max given, where zag steps a
 * value that is only committed on blur or Enter. So the clicker is a pair
 * of plain buttons, and the arrow keys are taken before zag sees them (it
 * leaves a key whose default is already prevented alone). Typing commits
 * through zag's own commit, when the box is left or Enter is pressed;
 * anything that is not a number by then is dropped and the value shown
 * comes back, and Escape drops the typing at once. What is shown is the
 * value given until something is typed, so a value that comes back clamped
 * from the action replaces the typing rather than fighting it.
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

  function commit(text: string) {
    const number = Number(text);
    setTyped(null);
    if (text.trim() !== "" && Number.isFinite(number) && number !== value) onCommit(number);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setTyped(null);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      // The arrows step the value as the clicker does, whatever is half typed.
      event.preventDefault();
      if (!canEdit) return;
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
      <NumberInput.Root
        size="xs"
        // Room for three digits and no more, so a line holds more stats.
        w="12"
        value={shown}
        onValueChange={(details) => setTyped(numberOnly(details.value))}
        onValueCommit={(details) => commit(details.value)}
        min={min}
        max={typeof max === "number" ? max : undefined}
        // The box shows what the action answers, clamped or not; a step
        // never goes past the bounds, and typing is the user's to correct.
        allowOverflow
        allowMouseWheel={false}
        readOnly={!canEdit}
      >
        <NumberInput.Input
          textAlign="right"
          aria-label={label}
          data-testid={testId}
          onKeyDown={onKeyDown}
        />
      </NumberInput.Root>
      {canEdit && clicker && (
        <Stack gap="0">
          <IconButtonWithTooltip label={`${label} up`} size="2xs" onClick={() => step(1)}>
            <ChevronUp />
          </IconButtonWithTooltip>
          <IconButtonWithTooltip label={`${label} down`} size="2xs" onClick={() => step(-1)}>
            <ChevronDown />
          </IconButtonWithTooltip>
        </Stack>
      )}
    </HStack>
  );
}
