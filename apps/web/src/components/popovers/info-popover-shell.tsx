"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { HStack, Popover, Portal } from "@chakra-ui/react";
import { ExternalLink, Info } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { IconLink } from "@/components/links/icon-link";
import { POPOVER_EDGE_GAP, usePopoverMaxHeight } from "./use-popover-max-height";

type Props = {
  /** The button's accessible name, and its tooltip unless one is given. */
  label: string;
  tooltip?: ReactNode;
  /** The button's colour; the story page passes its panel's muted text. */
  color?: string;
  /** What the button shows; the info icon unless a caller wants another. */
  icon?: ReactNode;
  /** Where the panel opens, relative to the button. */
  placement?: "bottom-end" | "bottom-start";
  /** The panel's width: sm for a reading, md for a form. */
  width?: "sm" | "md";
  /** The panel's heading, which names the dialog too. */
  heading: string;
  /** A line under the heading, in the header: an element's title. */
  subheading?: ReactNode;
  /**
   * A page showing the same detail on its own, opened in a new tab from a
   * button beside the heading. Absent means the panel has no page.
   */
  popoutHref?: string;
  /**
   * A selector for what takes focus as the panel opens, a form's first field
   * say; zag would otherwise settle focus on the panel itself a moment later.
   */
  initialFocus?: string;
  /** The panel is opening: what loads on first open starts here. */
  onOpen?: () => void;
  /** The panel's body, drawn only while it is open, given a way to close it. */
  children: (close: () => void) => ReactNode;
};

/**
 * A small info button on a card, a row or a pill, and the panel it opens:
 * the button with its tooltip, the popover anchored to it, a header with
 * the heading and an optional pop-out link, and the body under it. Every
 * popover of this shape is drawn by this, so they are named, sized and
 * positioned alike.
 *
 * The panel is mounted on opening and unmounted on closing, so a table of
 * pills does not hold a hidden copy of every panel and each opening starts
 * afresh. Zag links a dialog to its Popover.Title only if the title is in
 * the page as the machine starts (popover.machine's checkRenderedElements
 * runs once, on entry), which a lazily mounted one is not, so the content
 * is named outright with the heading's words; that is the name whether or
 * not the title is found.
 */
export function InfoPopoverShell({
  label,
  tooltip,
  color,
  icon,
  placement = "bottom-end",
  width = "sm",
  heading,
  subheading,
  popoutHref,
  initialFocus,
  onOpen,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const content = useRef<HTMLDivElement>(null);
  // Measured from the trigger when it opens: a tall panel opened from a row
  // near the top of the page would otherwise run off the top.
  const maxHeight = usePopoverMaxHeight(open, triggerId);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (details.open) onOpen?.();
      }}
      // The same gap the measured height leaves, so the positioner and the
      // cap agree on where the edge is.
      positioning={{ placement, overflowPadding: POPOVER_EDGE_GAP }}
      ids={{ trigger: triggerId }}
      lazyMount
      unmountOnExit
      initialFocusEl={
        initialFocus
          ? () => content.current?.querySelector<HTMLElement>(initialFocus) ?? null
          : undefined
      }
    >
      <IconButtonWithTooltip
        label={label}
        tooltip={tooltip}
        color={color}
        popoverTrigger={triggerId}
      >
        {icon ?? <Info />}
      </IconButtonWithTooltip>
      <Portal>
        <Popover.Positioner>
          {/* Notes and descriptions run long, so the panel scrolls inside
              itself rather than off the edge of the viewport: the cap is the
              room actually free on the side the positioner puts it. */}
          <Popover.Content
            ref={content}
            aria-label={heading}
            w={width}
            maxH={maxHeight ?? "80vh"}
            overflowY="auto"
          >
            <Popover.Arrow />
            <Popover.Header>
              <HStack justify="space-between" align="start" gap="2">
                <Popover.Title fontWeight="semibold">{heading}</Popover.Title>
                {popoutHref && (
                  <IconLink label="Open in a new tab" href={popoutHref} newTab>
                    <ExternalLink />
                  </IconLink>
                )}
              </HStack>
              {subheading}
            </Popover.Header>
            <Popover.Body>{children(() => setOpen(false))}</Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
