"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HStack } from "@chakra-ui/react";
import { NavDrawer } from "./nav-drawer";
import { NavUserButtons } from "./nav-user-buttons";

export type NavFold = "sm" | "md";

type Props = {
  /**
   * The width below which the user's buttons leave the header for the
   * drawer, so the hamburger is all that is left on the right. The menu bar
   * folds at md, where its links do; the play screens' header at sm, since
   * it has a title and session to keep room for.
   */
  foldBelow: NavFold;
  /** The page's own buttons, listed above the user's in the drawer (see PlayHeader). */
  menu?: ReactNode;
};

// The right-hand side of a header: feedback, theme, the administrators'
// wrench, notifications and account, and the hamburger below md. The menu
// bar and the play screens' header (PlayHeader) both render this, so the
// two stay the same.
export function NavActions({ foldBelow, menu }: Props) {
  const pathname = usePathname();

  return (
    // 4px, not 0: the items are ghost buttons whose hover backgrounds would
    // otherwise touch.
    <HStack gap="1">
      <HStack gap="1" hideBelow={foldBelow}>
        <NavUserButtons />
      </HStack>
      <NavDrawer pathname={pathname} foldBelow={foldBelow} menu={menu} />
    </HStack>
  );
}
