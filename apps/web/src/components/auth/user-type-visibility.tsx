"use client";

import type { ReactNode } from "react";
import { useUser } from "@/components/auth/user-provider";
import { isUserTypeShown } from "@/lib/user-types";

// At least one of the two bounds: with neither, the children could never
// show, which is a mistake rather than something to write on purpose.
type Rule = { showBelow: number; showAbove?: number } | { showBelow?: number; showAbove: number };

type Props = Rule & {
  /** Rendered in place of the children where they are hidden; nothing if absent. */
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * Shows its children only to the user types its rule allows, by the signed-in
 * account's s_user_types id, where smaller is more powerful (USER_TYPES in
 * lib/user-types.ts): `showAbove={USER_TYPES.paidPlayer}` for storytellers
 * and administrators. The bounds are strict, and anything the rule does not
 * allow is hidden. The counterpart of EnvironmentVisibility.
 *
 * This only decides what is drawn. Anything a type must not be able to do is
 * refused again by the server action behind it.
 */
export function UserTypeVisibility({ showBelow, showAbove, fallback, children }: Props) {
  const user = useUser();
  return isUserTypeShown(user.idUserType, { showBelow, showAbove }) ? children : (fallback ?? null);
}
