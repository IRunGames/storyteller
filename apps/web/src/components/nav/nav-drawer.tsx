"use client";

import { useState } from "react";
import { CloseButton, Drawer, IconButton, Portal, Stack } from "@chakra-ui/react";
import { NAV_ITEMS, isActive } from "./nav-items";
import { NavLink } from "./nav-link";
import { MenuIcon } from "./icons";

// Below md the inline links are hidden and this hamburger takes their place.
export function NavDrawer({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      placement="start"
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
              <Stack as="nav" aria-label="Primary" gap="2">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    active={isActive(pathname, item.href)}
                    onNavigate={() => setOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
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
