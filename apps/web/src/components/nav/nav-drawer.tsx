"use client";

import { useState, type ReactNode } from "react";
import {
  Box,
  CloseButton,
  Drawer,
  HStack,
  IconButton,
  Portal,
  Separator,
  Stack,
} from "@chakra-ui/react";
import { NAV_ITEMS, isActive } from "./nav-items";
import { ADMIN_ITEMS, AdminOnly } from "./nav-admin-menu";
import type { NavFold } from "./nav-actions";
import { NavDrawerContext } from "./nav-drawer-context";
import { NavLink } from "./nav-link";
import { NavUserButtons } from "./nav-user-buttons";
import { Menu as MenuIcon } from "lucide-react";

type Props = {
  pathname: string;
  /** Where the user's buttons fold into the drawer; see NavActions. */
  foldBelow: NavFold;
  /** The page's own buttons, listed first; see NavActions. */
  menu?: ReactNode;
};

// Below md the inline links are hidden and this hamburger takes their place.
//
// Below foldBelow the drawer starts with the page's own buttons if it has
// any (the tables' panel toggles), drawn with their names through
// NavDrawerContext, then a separator, the user's buttons and another
// separator before the links: the header has room for none of them there.
// Above it the header still shows them, so the drawer leaves them out.
//
// Mounted only while open: the user's buttons are a second copy of the
// header's, each with its own state and requests, which should not run
// behind a closed drawer.
export function NavDrawer({ pathname, foldBelow, menu }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      placement="start"
      lazyMount
      unmountOnExit
    >
      <Drawer.Trigger asChild>
        <IconButton
          aria-label="Open menu"
          variant="ghost"
          boxSize="11"
          rounded="10px"
          color="nav.icon"
          hideFrom="md"
        >
          <MenuIcon />
        </IconButton>
      </Drawer.Trigger>
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content bg="nav.bg" color="nav.fg">
            <Drawer.Header>
              <Drawer.Title>Menu</Drawer.Title>
            </Drawer.Header>
            <Drawer.Body>
              <Box hideFrom={foldBelow}>
                {menu && (
                  <>
                    <NavDrawerContext.Provider value={{ close: () => setOpen(false) }}>
                      <Stack gap="1">{menu}</Stack>
                    </NavDrawerContext.Provider>
                    <Separator my="3" />
                  </>
                )}
                <HStack gap="1" wrap="wrap">
                  <NavUserButtons />
                </HStack>
                <Separator my="3" />
              </Box>
              <Stack as="nav" aria-label="Primary" gap="2">
                {NAV_ITEMS.map((item) => (
                  <Stack key={item.href} gap="2">
                    <NavLink
                      href={item.href}
                      active={isActive(pathname, item.href)}
                      onNavigate={() => setOpen(false)}
                    >
                      {item.label}
                    </NavLink>
                    {/* The drawer has the room the header lacks, so a
                        section's sub-pages are listed under it, indented,
                        rather than folded into a menu. */}
                    {item.children?.map((child) => (
                      <Box key={child.href} ps="6">
                        <NavLink
                          href={child.href}
                          active={isActive(pathname, child.href)}
                          onNavigate={() => setOpen(false)}
                        >
                          {child.label}
                        </NavLink>
                      </Box>
                    ))}
                  </Stack>
                ))}
                {/* The wrench's tools, for an administrator, listed with
                    the pages they sit beside in the header. */}
                <AdminOnly>
                  {ADMIN_ITEMS.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      active={isActive(pathname, item.href)}
                      onNavigate={() => setOpen(false)}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </AdminOnly>
              </Stack>
            </Drawer.Body>
            <Drawer.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
