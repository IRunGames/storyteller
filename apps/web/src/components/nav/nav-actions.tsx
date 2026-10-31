"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HStack } from "@chakra-ui/react";
import { NavDrawer } from "./nav-drawer";
import { NavUserButtons } from "./nav-user-buttons";

type Props = {
  /**
   * Given, even as null, the user's buttons fold into the drawer below sm,
   * so the hamburger is all that is left on the right; anything but null is
   * the page's own buttons, listed above them (see PlayHeader). Left out, as
   * the menu bar does, the buttons stay in the header at every width.
   */
  menu?: ReactNode;
};

// The right-hand side of a header: feedback, theme, the administrators'
// wrench, notifications, account and, below md, the drawer. The menu bar and the table's own header at
// /play/[id] both render this, so the two stay the same.
export function NavActions({ menu }: Props) {
  const pathname = usePathname();

  return (
    // 4px, not 0: the items are ghost buttons whose hover backgrounds would
    // otherwise touch.
    <HStack gap="1">
      <HStack gap="1" hideBelow={menu !== undefined ? "sm" : undefined}>
        <NavUserButtons />
      </HStack>
      <NavDrawer pathname={pathname} menu={menu} />
    </HStack>
  );
}
