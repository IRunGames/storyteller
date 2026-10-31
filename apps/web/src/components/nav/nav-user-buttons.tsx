"use client";

import { usePathname } from "next/navigation";
import { NavFeedbackPopover } from "@/components/feedback/nav-feedback-popover";
import { NavAccountMenu } from "./nav-account-menu";
import { NavAdminMenu } from "./nav-admin-menu";
import { NavNotificationsBell } from "./nav-notifications-bell";
import { NavThemeMenu } from "./nav-theme-menu";

// The buttons that belong to the user rather than the page: feedback, theme,
// the administrators' wrench, notifications and account. A fragment, so the
// header's right-hand group and the drawer each lay them out in their own row.
export function NavUserButtons() {
  const pathname = usePathname();

  return (
    <>
      <NavFeedbackPopover pathname={pathname} />
      <NavThemeMenu />
      <NavAdminMenu />
      <NavNotificationsBell />
      <NavAccountMenu />
    </>
  );
}
