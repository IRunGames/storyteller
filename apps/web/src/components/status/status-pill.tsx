"use client";

import { useState, useTransition } from "react";
import { chakra, Menu, Popover, Portal, Span, Text } from "@chakra-ui/react";
import { statusLabel, transitionsFrom, type StatusOption, type StatusTable } from "@/lib/status";
import { sa_setRowStatus } from "./actions";
import { pillStyle } from "./pill-style";
import { toaster } from "@/components/ui/toaster";

type Props = {
  /** Which table the row is in; the action checks it against its own list. */
  table: StatusTable;
  /** The row's primary key. */
  id: number;
  /** The status the row holds now. */
  status: string;
  /** The workflow's statuses in order, from sa_listStatusOptions. */
  options: StatusOption[];
  /**
   * The viewer owns the thing this status belongs to, so the pill is a menu
   * of the moves the workflow allows. Everyone else gets the same pill
   * without the menu.
   */
  canEdit?: boolean;
  /** The new status, once the action has taken it, so the list can keep up. */
  onChanged?: (status: string) => void;
};

// The interactive pill is a real button: Span polymorphed with `as` keeps
// the span's own prop types, which have no `type`, and a trigger inside a
// form must not default to submitting it.
const PillButton = chakra("button");

/**
 * A row's status, coloured by how far through its workflow it has come. For
 * the owner it is also the way to move it: the menu lists the transitions the
 * workflow allows out of the status the row holds, and choosing one takes
 * effect immediately. A status with no way out opens a note saying so.
 *
 * The change is shown before the action answers, because the menu closing on
 * a pill that still reads the old word looks like nothing happened. A refusal
 * puts the old status back.
 */
export function StatusPill({ table, id, status, options, canEdit = false, onChanged }: Props) {
  const [shown, setShown] = useState(status);
  const [, startTransition] = useTransition();

  // The row's own status wins when it changes underneath: a list that
  // reloaded, or another pill's change to the same row.
  const [lastGiven, setLastGiven] = useState(status);
  if (lastGiven !== status) {
    setLastGiven(status);
    setShown(status);
  }

  const moves = transitionsFrom(shown, options);
  // The workflow's own label, falling back to the key for a status the
  // options do not list — a row loaded before a status was renamed, say.
  const label = options.find((option) => option.key === shown)?.label ?? statusLabel(shown);

  function choose(next: string) {
    const previous = shown;
    setShown(next);
    startTransition(async () => {
      try {
        const result = await sa_setRowStatus(table, id, next);
        if (result.ok) {
          onChanged?.(result.status);
          return;
        }
        setShown(previous);
        toaster.create({ title: result.error, type: "error" });
      } catch {
        setShown(previous);
        toaster.create({ title: "That status could not be changed.", type: "error" });
      }
    });
  }

  if (!canEdit) {
    return (
      <Span data-status={shown} {...pillStyle()}>
        {label}
      </Span>
    );
  }

  // The owner pressing a status the workflow leads nowhere out of would
  // otherwise get nothing at all, which reads as broken. Say why instead:
  // this one is final, and the database would refuse any move out of it.
  if (moves.length === 0) {
    return (
      <Popover.Root positioning={{ placement: "bottom-start" }}>
        <Popover.Trigger asChild>
          <PillButton
            type="button"
            data-status={shown}
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

  return (
    <Menu.Root onSelect={(details) => choose(details.value)}>
      <Menu.Trigger asChild>
        <PillButton
          type="button"
          data-status={shown}
          cursor="pointer"
          {...pillStyle()}
          // The only thing that changes on hover is the edge, since the fill
          // is already the highlight at full strength.
          _hover={{ borderColor: "status.contrast" }}
        >
          {label}
        </PillButton>
      </Menu.Trigger>
      {/* Through a Portal like every other floating layer, so a pill inside a
          scrolling Prep Work column is not clipped by it. */}
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
}
