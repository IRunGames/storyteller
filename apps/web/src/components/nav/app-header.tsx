"use client";

import { usePathname } from "next/navigation";
import { Box, HStack, IconButton, Tooltip } from "@chakra-ui/react";
import { AccountMenu, type HeaderUser } from "./account-menu";
import { BrandMark } from "./brand-mark";
import { BellIcon } from "./icons";
import { NAV_ITEMS, isActive } from "./nav-items";
import { NavDrawer } from "./nav-drawer";
import { NavLink } from "./nav-link";
import { ThemeMenu } from "./theme-menu";

// The signed-in app's menu bar. Play has its own layout and does not mount
// this; every page under (app)/(nav)/ does.
export function AppHeader({ user }: { user: HeaderUser }) {
  const pathname = usePathname();

  return (
    <HStack
      as="header"
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
        <BrandMark />
        <HStack as="nav" aria-label="Primary" gap="2" hideBelow="md">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              active={isActive(pathname, item.href)}
            >
              {item.label}
            </NavLink>
          ))}
        </HStack>
      </HStack>

      <HStack gap="4">
        <ThemeMenu />
        <Tooltip.Root openDelay={200}>
          <Tooltip.Trigger asChild>
            {/* A disabled button swallows pointer events, so the wrapper is
                what the tooltip listens to. */}
            <Box as="span" display="inline-flex">
              <IconButton
                aria-label="Notifications"
                variant="ghost"
                boxSize="11"
                rounded="10px"
                color="nav.icon"
                disabled
              >
                <BellIcon />
              </IconButton>
            </Box>
          </Tooltip.Trigger>
          <Tooltip.Positioner>
            <Tooltip.Content>Coming soon</Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
        <AccountMenu user={user} />
        <NavDrawer pathname={pathname} />
      </HStack>
    </HStack>
  );
}
