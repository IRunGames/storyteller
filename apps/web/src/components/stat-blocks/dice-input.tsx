"use client";

import { useState } from "react";
import { Input, InputGroup, Stack, Text } from "@chakra-ui/react";
import { Eye } from "lucide-react";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { rollDice } from "@/lib/dice";

type Props = {
  /** The box's accessible name; the eye is "Try <label>". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
};

/**
 * A text box for dice notation as the chat's /roll takes it ("2d6",
 * "8d8+3"), with an eye at its end that rolls what is typed once and shows
 * the result under the box as an example ("2d6: [3, 4] = 7"), or why it
 * cannot be read. The example is only ever a sample, rolled here in the
 * browser and kept by nobody; typing clears it. The template editor uses
 * it for a stat's roll and for what a stat is initialized as.
 */
export function DiceInput({ label, value, onChange, onBlur, placeholder = "2d6" }: Props) {
  const [example, setExample] = useState<string | null>(null);
  const tryIt = () => {
    const result = rollDice(value, null);
    setExample(result.ok ? result.roll.detail : result.error);
  };
  return (
    <Stack gap="1">
      <InputGroup
        endElement={
          <PrepIconButton
            label={`Try ${label}`}
            size="2xs"
            disabled={value.trim() === ""}
            onClick={tryIt}
          >
            <Eye />
          </PrepIconButton>
        }
        endElementProps={{ pointerEvents: "auto" }}
      >
        <Input
          size="sm"
          autoComplete="off"
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setExample(null);
          }}
          onBlur={onBlur}
        />
      </InputGroup>
      {example !== null && (
        <Text fontSize="xs" color="fg.muted" data-testid="dice-example">
          {example}
        </Text>
      )}
    </Stack>
  );
}
