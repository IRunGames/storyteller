"use client";

import { STATUS_CHANGE_FAILED } from "@/lib/messages";
import { statusLabel, transitionsFrom, type StatusOption, type StatusTable } from "@/lib/status";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { sa_setRowStatus } from "./actions";
import { StatusPillSpan } from "./pill-style";
import { StatusMenuPill, type StatusConfirmation } from "./status-menu-pill";

export type { StatusConfirmation };

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
  /** A tooltip above the pill, saying what pressing it does. */
  tooltip?: string;
  /**
   * Asks before moving to some statuses: what to say for a move to `next`,
   * or null to move straight away. The question opens in a popover beside
   * the pill once the status is chosen, and only Confirm moves it.
   */
  confirm?: (next: string) => StatusConfirmation | null;
};

/**
 * A row's status. For the owner it is also the way to move it: the menu
 * lists the transitions the workflow allows out of the status the row holds
 * (StatusMenuPill draws it), and choosing one takes effect immediately
 * through sa_setRowStatus.
 *
 * The change is shown before the action answers and put back if it refuses
 * (useOptimisticAction).
 */
export function StatusPill({
  table,
  id,
  status,
  options,
  canEdit = false,
  onChanged,
  tooltip,
  confirm,
}: Props) {
  const [shown, choose] = useOptimisticAction(
    status,
    async (next) => {
      const result = await sa_setRowStatus(table, id, next);
      if (!result.ok) return result;
      onChanged?.(result.status);
      return { ok: true, value: result.status };
    },
    { failed: STATUS_CHANGE_FAILED },
  );

  // The workflow's own label, falling back to the key for a status the
  // options do not list — a row loaded before a status was renamed, say.
  const label = options.find((option) => option.key === shown)?.label ?? statusLabel(shown);

  if (!canEdit) {
    return <StatusPillSpan data-status={shown}>{label}</StatusPillSpan>;
  }

  return (
    <StatusMenuPill
      label={label}
      value={shown}
      moves={transitionsFrom(shown, options)}
      onChoose={choose}
      tooltip={tooltip}
      confirm={confirm}
    />
  );
}
