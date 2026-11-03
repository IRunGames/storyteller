"use client";

import { useState, useTransition } from "react";
import { Span } from "@chakra-ui/react";
import { sa_setUserStatus } from "@/app/(app)/(nav)/admin/users/actions";
import { pillStyle } from "@/components/status/pill-style";
import { StatusMenuPill, type StatusConfirmation } from "@/components/status/status-menu-pill";
import { toaster } from "@/components/ui/toaster";
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
 * The change is shown before the action answers, as StatusPill does; a
 * refusal puts the old status back and says why in a toast, there being
 * nothing on the page for the administrator to correct.
 */
export function UserStatusChip({ idUser, status, options, readOnly = false, onChanged }: Props) {
  const [shown, setShown] = useState<UserStatus>(status);
  const [, startTransition] = useTransition();

  // The row's own status wins when it changes underneath: a page that
  // reloaded, say.
  const [lastGiven, setLastGiven] = useState(status);
  if (lastGiven !== status) {
    setLastGiven(status);
    setShown(status);
  }

  const key = shown.toUpperCase();
  const label = options.find((option) => option.key === key)?.label ?? statusLabel(key);

  if (readOnly || shown === "guest") {
    return (
      <Span data-status={shown} {...pillStyle()}>
        {label}
      </Span>
    );
  }

  function choose(next: string) {
    const previous = shown;
    setShown(next.toLowerCase() as UserStatus);
    startTransition(async () => {
      try {
        const result = await sa_setUserStatus(idUser, next);
        if (result.ok) {
          setShown(result.status);
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
      onChoose={choose}
      tooltip="Change status"
      confirm={confirm}
    />
  );
}
