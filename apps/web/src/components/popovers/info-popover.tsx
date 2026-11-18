"use client";

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Skeleton, Stack } from "@chakra-ui/react";
import { FormError } from "@/components/forms/form-error";
import { InfoPopoverShell } from "./info-popover-shell";

type Props<T> = {
  /** Names the button and its tooltip, both: "Scene info", "Session info". */
  label: string;
  /** The button's colour; the story page passes its panel's muted text. */
  color?: string;
  /** What the button shows; the info icon unless a caller wants another. */
  icon?: ReactNode;
  /** Read on first open. Null means the row is no longer there. */
  load: () => Promise<T | null>;
  /** What the panel says when load comes back null. */
  missingText: string;
  /** What it says when load throws. */
  errorText: string;
  /** The panel's heading, asked before the load as well as after it. */
  heading: (loaded: T | null) => string;
  /**
   * A page showing the same detail on its own, opened in a new tab from a
   * button beside the heading. Absent means the panel has no page.
   */
  popoutHref?: string;
  /**
   * The panel's body, once there is something to show it. The setter is for a
   * body that changes what it was given — a pill that moves the status.
   */
  children: (loaded: T, setLoaded: Dispatch<SetStateAction<T | null>>) => ReactNode;
};

// The small info button on a card or a row, and the popover it opens
// (InfoPopoverShell): a heading, and whatever the caller renders under it
// once the detail has arrived. The detail is fetched on first open rather
// than with the list, since most rows are never opened, and kept
// afterwards.
export function InfoPopover<T>({
  label,
  color,
  icon,
  load,
  missingText,
  errorText,
  heading,
  popoutHref,
  children,
}: Props<T>) {
  const [loaded, setLoaded] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);

  async function fetchOnce() {
    if (loaded !== null || isLoading) return;
    setLoading(true);
    setError(null);
    try {
      const found = await load();
      if (found) setLoaded(found);
      else setError(missingText);
    } catch {
      setError(errorText);
    } finally {
      setLoading(false);
    }
  }

  return (
    <InfoPopoverShell
      label={label}
      color={color}
      icon={icon}
      heading={heading(loaded)}
      popoutHref={popoutHref}
      onOpen={() => void fetchOnce()}
    >
      {() =>
        error ? (
          <FormError message={error} size="sm" />
        ) : loaded !== null ? (
          children(loaded, setLoaded)
        ) : (
          <Stack gap="3">
            <Skeleton h="5" w="1/3" />
            <Skeleton h="4" />
            <Skeleton h="4" w="2/3" />
          </Stack>
        )
      }
    </InfoPopoverShell>
  );
}
