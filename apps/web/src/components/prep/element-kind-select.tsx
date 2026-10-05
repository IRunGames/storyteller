import type { ComponentProps } from "react";
import { NativeSelect } from "@chakra-ui/react";
import { ELEMENT_KINDS, ELEMENT_KIND_LABELS } from "@/lib/elements";

type Props = ComponentProps<typeof NativeSelect.Field>;

/**
 * A select of the element kinds, in the elements_kind enum's order, which is
 * also the order of the board's columns. Its props go straight to the field,
 * so react-hook-form's register() spreads onto it like any other input.
 */
export function ElementKindSelect(props: Props) {
  return (
    <NativeSelect.Root>
      <NativeSelect.Field {...props}>
        {ELEMENT_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {ELEMENT_KIND_LABELS[kind]}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}
