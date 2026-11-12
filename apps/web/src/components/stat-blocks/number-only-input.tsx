"use client";

import { forwardRef, type ChangeEvent, type ComponentProps } from "react";
import { Input } from "@chakra-ui/react";
import { numberOnly } from "@/lib/stat-blocks";

type Props = ComponentProps<typeof Input>;

/**
 * An Input for a stat held to a number: whatever is typed or pasted is cut
 * to what can become one (numberOnly) before the form's own onChange sees
 * it, so the field never holds a word. A lone "-" or a trailing "." are let
 * through on the way to a number; the schema says "Enter a number." if
 * they are left so. Pasting fires the same change event, so one handler
 * covers both.
 */
export const NumberOnlyInput = forwardRef<HTMLInputElement, Props>(function NumberOnlyInput(
  { onChange, ...props },
  ref,
) {
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      {...props}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const kept = numberOnly(event.target.value);
        if (kept !== event.target.value) event.target.value = kept;
        onChange?.(event);
      }}
    />
  );
});
