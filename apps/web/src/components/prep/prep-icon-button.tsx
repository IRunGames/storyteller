import type { ComponentProps, ReactNode } from "react";
import { IconButton, Portal, Tooltip } from "@chakra-ui/react";

type Props = {
  /** The accessible name and the tooltip, one string for both. */
  label: string;
  onClick: () => void;
  children: ReactNode;
} & Pick<ComponentProps<typeof IconButton>, "size">;

// A column's small ghost icon button with the tooltip every icon button
// carries. The board has three per column, so the tooltip wrapper lives here
// once rather than fifteen times over.
export function PrepIconButton({ label, onClick, children, size = "xs" }: Props) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton aria-label={label} variant="ghost" size={size} rounded="full" onClick={onClick}>
          {children}
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
