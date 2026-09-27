"use client";

import { useId, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Alert, IconButton, Popover, Portal, Skeleton, Stack, Tooltip } from "@chakra-ui/react";
import { Info } from "lucide-react";
import { POPOVER_EDGE_GAP, usePopoverMaxHeight } from "./use-popover-max-height";

type Props<T> = {
  /** Names the button and its tooltip, both: "Scene info", "Session info". */
  label: string;
  /** The button's colour; the story page passes its panel's muted text. */
  color?: string;
  /** Read on first open. Null means the row is no longer there. */
  load: () => Promise<T | null>;
  /** What the panel says when load comes back null. */
  missingText: string;
  /** What it says when load throws. */
  errorText: string;
  /** The panel's heading, asked before the load as well as after it. */
  heading: (loaded: T | null) => string;
  /**
   * The panel's body, once there is something to show it. The setter is for a
   * body that changes what it was given — a pill that moves the status.
   */
  children: (loaded: T, setLoaded: Dispatch<SetStateAction<T | null>>) => ReactNode;
};

// The small info button on a card or a row, and the popover it opens: a
// heading, and whatever the caller renders under it once the detail has
// arrived. Everything up to that point is the same wherever the button sits,
// so it lives here rather than being copied per column.
//
// The detail is fetched on first open rather than with the list, since most
// rows are never opened, and kept afterwards.
export function InfoPopover<T>({
  label,
  color,
  load,
  missingText,
  errorText,
  heading,
  children,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);
  // Both machines look their trigger up by id; with separate ids the
  // tooltip's wins and the popover opens at the page corner.
  const triggerId = useId();
  // Measured from the trigger when it opens: a tall panel opened from a row
  // near the top of the page would otherwise run off the top.
  const maxHeight = usePopoverMaxHeight(open, triggerId);

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

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void fetchOnce();
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      // The same gap the measured height leaves, so the positioner and the
      // cap agree on where the edge is.
      positioning={{ placement: "bottom-end", overflowPadding: POPOVER_EDGE_GAP }}
      ids={{ trigger: triggerId }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton aria-label={label} variant="ghost" size="xs" rounded="full" color={color}>
              <Info />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>{label}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          {/* Notes and scene descriptions run long, so the panel scrolls
              inside itself rather than off the edge of the viewport: the cap
              is the room actually free on the side the positioner puts it. */}
          <Popover.Content w="sm" maxH={maxHeight ?? "80vh"} overflowY="auto">
            <Popover.Arrow />
            {/* Popover.Title, not bare text: it is what the dialog's
                aria-labelledby points at, so the popover gets a name. */}
            <Popover.Header fontWeight="semibold">
              <Popover.Title>{heading(loaded)}</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              {error ? (
                // role="alert", which Chakra's Alert does not set itself.
                <Alert.Root role="alert" status="error" size="sm">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              ) : loaded !== null ? (
                children(loaded, setLoaded)
              ) : (
                <Stack gap="3">
                  <Skeleton h="5" w="1/3" />
                  <Skeleton h="4" />
                  <Skeleton h="4" w="2/3" />
                </Stack>
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
