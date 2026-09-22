"use client";

import { usePathname } from "next/navigation";
import { HStack } from "@chakra-ui/react";
import { NavFeedbackPopover } from "@/components/feedback/nav-feedback-popover";
import { NavAccountMenu } from "./nav-account-menu";
import { BrandMark } from "./brand-mark";
import { NAV_ITEMS, isActive } from "./nav-items";
import { NavDrawer } from "./nav-drawer";
import { NavLink } from "./nav-link";
import { NavNotificationsBell } from "./nav-notifications-bell";
import { NavSubMenu } from "./nav-sub-menu";
import { NavThemeMenu } from "./nav-theme-menu";

// The signed-in app's menu bar. The table at /play/[id] has its own header
// and does not mount this; every page under (app)/(nav)/ does.
export function AppHeader() {
  const pathname = usePathname();

  return (
    // Sticky rather than fixed so it keeps its place in the flow and the page
    // needs no top padding to clear it. zIndex "sticky" (1100) sits above
    // in-page content such as the cards' floating buttons (zIndex 1) and
    // below every portalled layer (popover, tooltip, modal), so a menu opened
    // from the header still draws over it.
    <HStack
      as="header"
      position="sticky"
      top="0"
      zIndex="sticky"
      h="16"
      px={{ base: "4", md: "10" }}
      justify="space-between"
      flexShrink="0"
      bg="nav.bg"
      color="nav.fg"
      borderBottomWidth="1px"
      borderColor="nav.border"
    >
      <HStack gap="9">
        <BrandMark active={isActive(pathname, "/home")} />
        <HStack as="nav" aria-label="Primary" gap="2" hideBelow="md">
          {NAV_ITEMS.map((item) => (
            // A section with sub-pages keeps its pill as the link and grows a
            // chevron that opens them; gap 0 so the two read as one control.
            <HStack key={item.href} gap="0">
              <NavLink href={item.href} active={isActive(pathname, item.href)}>
                {item.label}
              </NavLink>
              {item.children && <NavSubMenu item={item} pathname={pathname} />}
            </HStack>
          ))}
        </HStack>
      </HStack>

      {/* 4px, not 0: the items are ghost buttons whose hover backgrounds would
          otherwise touch. */}
      <HStack gap="1">
        <NavFeedbackPopover pathname={pathname} />
        <NavThemeMenu />
        <NavNotificationsBell />
        <NavAccountMenu />
        <NavDrawer pathname={pathname} />
      </HStack>
    </HStack>
  );
}
