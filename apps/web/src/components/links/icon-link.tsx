import type { ComponentProps, ReactNode } from "react";
import NextLink from "next/link";
import { IconButton, Portal, Tooltip } from "@chakra-ui/react";

type Props = {
  /** The accessible name and the tooltip, one string for both. */
  label: string;
  href: string;
  children: ReactNode;
  /** Opens the page in a tab of its own rather than in place of this one. */
  newTab?: boolean;
} & Pick<ComponentProps<typeof IconButton>, "size" | "color">;

// A small round ghost icon that is a link rather than a button, with the
// tooltip every icon button carries: a card's edit pencil, a popover's
// pop-out. A real anchor, so it can be middle-clicked or copied like any link.
export function IconLink({ label, href, children, newTab, size = "xs", color }: Props) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          asChild
          aria-label={label}
          variant="ghost"
          size={size}
          rounded="full"
          color={color}
        >
          <NextLink
            href={href}
            target={newTab ? "_blank" : undefined}
            rel={newTab ? "noopener noreferrer" : undefined}
          >
            {children}
          </NextLink>
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
