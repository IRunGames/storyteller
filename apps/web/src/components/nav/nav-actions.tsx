"use client";

import { usePathname } from "next/navigation";
import { HStack } from "@chakra-ui/react";
import { NavFeedbackPopover } from "@/components/feedback/nav-feedback-popover";
import { NavAccountMenu } from "./nav-account-menu";
import { NavDrawer } from "./nav-drawer";
import { NavNotificationsBell } from "./nav-notifications-bell";
import { NavThemeMenu } from "./nav-theme-menu";

// The right-hand side of a header: feedback, theme, notifications, account
// and, below md, the drawer. The menu bar and the table's own header at
// /play/[id] both render this, so the two stay the same.
export function NavActions() {
  const pathname = usePathname();

  return (
    // 4px, not 0: the items are ghost buttons whose hover backgrounds would
    // otherwise touch.
    <HStack gap="1">
      <NavFeedbackPopover pathname={pathname} />
      <NavThemeMenu />
      <NavNotificationsBell />
      <NavAccountMenu />
      <NavDrawer pathname={pathname} />
    </HStack>
  );
}
