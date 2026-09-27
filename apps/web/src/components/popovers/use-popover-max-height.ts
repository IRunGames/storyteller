"use client";

import { useEffect, useState } from "react";

/**
 * How much clear space to leave between a popover and the edge of the screen.
 *
 * Exported because the positioner needs the same number: it is told this as
 * its overflowPadding while the height below is measured against it, and the
 * two disagreeing is a panel capped to a height it is not given.
 */
export const POPOVER_EDGE_GAP = 16;

/** Never shrink a popover below this, however little room there is. */
const FLOOR = 160;

/**
 * The tallest a popover can be and still sit on the screen, measured from its
 * trigger when it opens.
 *
 * The positioner flips a popover above its trigger when there is more room
 * there, but it will not make it shorter to fit: a tall panel opened from a
 * row near the top of the page runs off the top and its heading cannot be
 * reached. A viewport fraction like 80vh does not help, because what matters
 * is the space on one side of the trigger, not the height of the window.
 *
 * Chakra's positioner does publish a --available-height for exactly this, but
 * only when its size middleware runs, and it does not run here — the variable
 * comes back empty and the max-height that reads it resolves to nothing. So
 * the space is measured directly: the larger of above and below, which is the
 * side the positioner will choose.
 *
 * Returns undefined until it has measured, so a caller can fall back to
 * whatever it would have used.
 */
export function usePopoverMaxHeight(open: boolean, triggerId: string): string | undefined {
  const [maxHeight, setMaxHeight] = useState<string>();

  useEffect(() => {
    if (!open) return;

    function measure() {
      const trigger = document.getElementById(triggerId);
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const above = rect.top - POPOVER_EDGE_GAP;
      const below = window.innerHeight - rect.bottom - POPOVER_EDGE_GAP;
      setMaxHeight(`${Math.max(FLOOR, Math.floor(Math.max(above, below)))}px`);
    }

    measure();
    // The page can move under an open popover: the window resizes, or a
    // column scrolls. Capture, so a scroll inside any ancestor is heard.
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, triggerId]);

  return maxHeight;
}
