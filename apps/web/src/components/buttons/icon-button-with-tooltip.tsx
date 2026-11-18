import type { ComponentProps, ReactNode } from "react";
import { IconButton } from "@chakra-ui/react";
import { WithTooltip } from "./with-tooltip";

type Props = {
  /** The accessible name, and the tooltip unless one is given. */
  label: string;
  /** The tooltip, when it says more than the name: "Notes and lingering questions" for Session notes. */
  tooltip?: ReactNode;
  children: ReactNode;
  /**
   * Set when the button shows and hides something: it then reports
   * aria-expanded, and is solid in the theme's accent while open, as the story
   * page's Add Attachments + is. Absent for a button that just acts.
   */
  expanded?: boolean;
  /**
   * An outlined circle rather than a ghost: for a button that sits among
   * text, such as the run page's element popover, where a bare icon reads as
   * a symbol rather than something to press.
   */
  outlined?: boolean;
  /** The button opens a Menu or a Popover; see WithTooltip. */
  menuTrigger?: string;
  popoverTrigger?: string;
  /** See WithTooltip. */
  portalled?: boolean;
} & Omit<ComponentProps<typeof IconButton>, "aria-label" | "children">;

/**
 * A small round ghost icon button with the tooltip every icon button carries:
 * the boards' column buttons, a pill's +, a popover's trigger. The look is
 * the default; a button that needs another passes IconButton's own props
 * over it, as the header's do.
 */
export function IconButtonWithTooltip({
  label,
  tooltip,
  children,
  expanded,
  outlined = false,
  menuTrigger,
  popoverTrigger,
  portalled,
  ...button
}: Props) {
  return (
    <WithTooltip
      tooltip={tooltip ?? label}
      menuTrigger={menuTrigger}
      popoverTrigger={popoverTrigger}
      portalled={portalled}
    >
      <IconButton
        aria-label={label}
        aria-expanded={expanded}
        variant={expanded ? "solid" : outlined ? "outline" : "ghost"}
        size="xs"
        rounded="full"
        {...button}
      >
        {children}
      </IconButton>
    </WithTooltip>
  );
}
