import type { ReactNode } from "react";
import { Menu, Popover, Portal, Tooltip } from "@chakra-ui/react";

type Props = {
  /** What the tooltip says. */
  tooltip: ReactNode;
  /** The one element the tooltip, and any trigger, merge their props onto. */
  children: ReactNode;
  /**
   * The element also opens a Menu or a Popover: it is wrapped in that root's
   * Trigger, and this is the id both roots share. The site makes it with
   * `useId()` and passes it as `ids={{ trigger }}` to the Menu.Root or
   * Popover.Root around this.
   */
  menuTrigger?: string;
  popoverTrigger?: string;
  /** False keeps the tooltip out of the way: a popover that opens upward would sit under it. */
  disabled?: boolean;
  /**
   * False draws the tooltip in place rather than through a Portal: inside a
   * dialog that hides everything outside itself, or the header, whose buttons
   * were given their tooltips before floating layers were portalled.
   */
  portalled?: boolean;
};

/**
 * The tooltip every icon button carries, placed above it after a short pause
 * (docs/standards.md, UI). Written once here rather than at each button.
 *
 * When the element also opens a menu or a popover, `Tooltip.Trigger asChild`
 * wraps that root's `Trigger asChild`, so both merge onto the one element:
 * hover shows the tooltip, a press opens the menu. Each machine looks its
 * trigger up by id when positioning, and with separate ids the tooltip's
 * wins and the menu opens at the page corner, so the two roots are given the
 * same `ids={{ trigger }}` (nav-theme-menu.tsx is where this was first
 * found). The tooltip's root is inside the menu's here; the site writes the
 * menu's root around this and hands both the id.
 */
export function WithTooltip({
  tooltip,
  children,
  menuTrigger,
  popoverTrigger,
  disabled,
  portalled = true,
}: Props) {
  const trigger = menuTrigger ? (
    <Menu.Trigger asChild>{children}</Menu.Trigger>
  ) : popoverTrigger ? (
    <Popover.Trigger asChild>{children}</Popover.Trigger>
  ) : (
    children
  );
  return (
    <Tooltip.Root
      openDelay={200}
      positioning={{ placement: "top" }}
      ids={menuTrigger || popoverTrigger ? { trigger: menuTrigger ?? popoverTrigger } : undefined}
      disabled={disabled}
    >
      <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
      <Portal disabled={!portalled}>
        <Tooltip.Positioner>
          <Tooltip.Content>{tooltip}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
