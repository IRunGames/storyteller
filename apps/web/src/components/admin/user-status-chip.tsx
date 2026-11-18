"use client";

import { sa_setUserStatus } from "@/app/(app)/(nav)/admin/users/actions";
import { StatusPillSpan } from "@/components/status/pill-style";
import { StatusMenuPill, type StatusConfirmation } from "@/components/status/status-menu-pill";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { STATUS_CHANGE_FAILED } from "@/lib/messages";
import { statusLabel, transitionsFrom, type StatusOption } from "@/lib/status";
import type { UserStatus } from "@/lib/user-types";

type Props = {
  /** The account's primary key. */
  idUser: string;
  /** The status v_users gives the account: lower case, 'guest' included. */
  status: UserStatus;
  /** The Users Status Workflow's statuses in order, from sa_listUserStatusOptions. */
  options: StatusOption[];
  /**
   * A chip that only shows: the administrator's own row, which the action
   * refuses too, so no one locks themself out from this page.
   */
  readOnly?: boolean;
  /** The new status, once the action has taken it, so the table can keep up. */
  onChanged?: (status: UserStatus) => void;
};

// The verb for a move out of active, which is what the confirmation asks
// about. A status added to the workflow later gets its own label instead.
const VERB: Record<string, string> = {
  INACTIVE: "Deactivate",
  SUSPENDED: "Suspend",
  LOCKED: "Lock",
};

/**
 * An account's status on the administrators' Users page, and the way to
 * change it: the menu lists the moves the Users Status Workflow allows out of
 * the status the account holds, and choosing one takes effect on the
 * account's next request. The workflow's keys are upper case and v_users
 * hands the page lower-case words, so the chip translates at its edges and
 * the workflow helpers see keys.
 *
 * A guest's chip never opens: a guest is deleted rather than switched off,
 * and the action would refuse the move anyway. A move out of active asks
 * first, since it signs the account out; a move back to active does not.
 *
 * The change is shown before the action answers and put back if it refuses
 * (useOptimisticAction), as StatusPill does.
 */
export function UserStatusChip({ idUser, status, options, readOnly = false, onChanged }: Props) {
  // The menu hands out workflow keys and the chip shows v_users' words, so
  // the choice is translated before it is shown and the action gets the key.
  const [shown, choose] = useOptimisticAction<UserStatus>(
    status,
    async (next) => {
      const result = await sa_setUserStatus(idUser, next.toUpperCase());
      if (!result.ok) return result;
      onChanged?.(result.status);
      return { ok: true, value: result.status };
    },
    { failed: STATUS_CHANGE_FAILED },
  );

  const key = shown.toUpperCase();
  const label = options.find((option) => option.key === key)?.label ?? statusLabel(key);

  if (readOnly || shown === "guest") {
    return <StatusPillSpan data-status={shown}>{label}</StatusPillSpan>;
  }

  function confirm(next: string): StatusConfirmation | null {
    if (shown !== "active") return null;
    const verb = VERB[next] ?? `Mark ${statusLabel(next).toLowerCase()}`;
    return {
      title: `${verb} this account?`,
      body: "They will be signed out on their next page, and stay out until an administrator makes the account active again.",
      confirmLabel: verb,
    };
  }

  return (
    <StatusMenuPill
      label={label}
      value={shown}
      moves={transitionsFrom(key, options)}
      onChoose={(next) => choose(next.toLowerCase() as UserStatus)}
      tooltip="Change status"
      confirm={confirm}
    />
  );
}
