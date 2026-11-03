"use client";

import { useId, useState } from "react";
import { Button, chakra, HStack, Menu, Popover, Portal, Text, Tooltip } from "@chakra-ui/react";
import type { StatusOption } from "@/lib/status";
import { pillStyle } from "./pill-style";

/** What the pill's confirmation popover says before a move. */
export type StatusConfirmation = { title: string; body: string; confirmLabel: string };

type Props = {
  /** The status as a reader sees it. */
  label: string;
  /** The status key, for `data-status` on the pill. */
  value: string;
  /** The statuses the workflow allows out of this one, in workflow order. */
  moves: StatusOption[];
  /** Called with the chosen status key, once any confirmation is given. */
  onChoose: (next: string) => void;
  /** A tooltip above the pill, saying what pressing it does. */
  tooltip?: string;
  /**
   * Asks before moving to some statuses: what to say for a move to `next`,
   * or null to move straight away. The question opens in a popover beside
   * the pill once the status is chosen, and only Confirm moves it.
   */
  confirm?: (next: string) => StatusConfirmation | null;
};

// The interactive pill is a real button: Span polymorphed with `as` keeps
// the span's own prop types, which have no `type`, and a trigger inside a
// form must not default to submitting it.
const PillButton = chakra("button");

/**
 * The menu half of a status pill, with no idea what it is moving: the pill
 * that is pressed, the menu of moves out of the status it shows, the note it
 * opens instead when the workflow leads nowhere out of it, and the
 * confirmation some moves ask for first. StatusPill (a row of a story's own
 * tables) and the Users page's UserStatusChip (an account) each keep their
 * own status and action and hand this what to draw, so the two look and
 * behave alike without either copying the other.
 */
export function StatusMenuPill({ label, value, moves, onChoose, tooltip, confirm }: Props) {
  // The status waiting on the confirmation popover, and what it says.
  const [pending, setPending] = useState<{ next: string; ask: StatusConfirmation } | null>(null);
  // Tooltip and menu each look their trigger up by id; sharing one keeps the
  // menu from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();

  // Pressing a status the workflow leads nowhere out of would otherwise get
  // nothing at all, which reads as broken. Say why instead: this one is
  // final, and the database would refuse any move out of it.
  if (moves.length === 0) {
    return (
      <Popover.Root positioning={{ placement: "bottom-start" }}>
        <Popover.Trigger asChild>
          <PillButton
            type="button"
            data-status={value}
            cursor="pointer"
            {...pillStyle()}
            _hover={{ borderColor: "status.contrast" }}
          >
            {label}
          </PillButton>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content w="xs">
              <Popover.Arrow />
              <Popover.Body>
                <Popover.Title fontWeight="semibold">{label} is final</Popover.Title>
                <Text textStyle="sm" color="fg.muted" mt="1">
                  Nothing in this workflow leads out of {label.toLowerCase()}, so it cannot be moved
                  to another status.
                </Text>
              </Popover.Body>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
    );
  }

  const trigger = (
    <PillButton
      type="button"
      data-status={value}
      cursor="pointer"
      {...pillStyle()}
      // The only thing that changes on hover is the edge, since the fill
      // is already the highlight at full strength.
      _hover={{ borderColor: "status.contrast" }}
    >
      {label}
    </PillButton>
  );

  const menu = (
    <Menu.Root
      ids={{ trigger: triggerId }}
      onSelect={(details) => {
        const ask = confirm?.(details.value) ?? null;
        if (ask) setPending({ next: details.value, ask });
        else onChoose(details.value);
      }}
    >
      {tooltip ? (
        <Tooltip.Root
          openDelay={200}
          positioning={{ placement: "top" }}
          ids={{ trigger: triggerId }}
        >
          <Tooltip.Trigger asChild>
            <Menu.Trigger asChild>{trigger}</Menu.Trigger>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content>{tooltip}</Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      ) : (
        <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      )}
      {/* Through a Portal like every other floating layer, so a pill inside a
          scrolling Prep Work column or a table's scroll area is not clipped
          by it. */}
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="10rem">
            {moves.map((move) => (
              <Menu.Item key={move.key} value={move.key}>
                {move.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );

  if (!confirm) return menu;

  // The confirmation is anchored to the pill rather than opened by it: the
  // pill already opens the menu, and the question follows a choice made in
  // the menu (run-scene-select.tsx does the same).
  return (
    <Popover.Root
      open={pending !== null}
      onOpenChange={(details) => {
        if (!details.open) setPending(null);
      }}
      positioning={{ placement: "bottom-start" }}
    >
      <Popover.Anchor display="inline-flex">{menu}</Popover.Anchor>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="xs">
            <Popover.Arrow />
            <Popover.Body>
              <Popover.Title fontWeight="semibold">{pending?.ask.title}</Popover.Title>
              <Text textStyle="sm" color="fg.muted" mt="1">
                {pending?.ask.body}
              </Text>
              <HStack gap="2" mt="3" justify="flex-end">
                <Button size="sm" variant="outline" onClick={() => setPending(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (pending) onChoose(pending.next);
                    setPending(null);
                  }}
                >
                  {pending?.ask.confirmLabel}
                </Button>
              </HStack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
