"use client";

import { useId, useState } from "react";
import NextLink from "next/link";
import { IconButton, Menu, Portal, Tooltip } from "@chakra-ui/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { type NavItem, isActive } from "./nav-items";

interface NavSubMenuProps {
  /** The section whose children the menu lists. */
  item: NavItem;
  pathname: string;
}

// The chevron beside a section's pill in the header. The pill stays a plain
// link to the section, so reaching the section costs the same click as
// before; only the sub-pages sit behind this extra one. A menu rather than a
// second row of links because the header has one row and the drawer takes
// over below md, where the children are simply listed.
//
// Tooltip and menu each stamp an id on the one button and look their trigger
// up by that id when positioning; handing both the same id keeps the menu
// anchored to the chevron rather than the page corner.
export function NavSubMenu({ item, pathname }: NavSubMenuProps) {
  const triggerId = useId();
  // Controlled only so the chevron can point up while the menu is open; the
  // menu itself still decides when it opens and closes.
  const [open, setOpen] = useState(false);

  return (
    <Menu.Root
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: "bottom-start" }}
      ids={{ trigger: triggerId }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Menu.Trigger asChild>
            {/* Narrower than the header's other icon buttons so the chevron
                reads as part of the pill it follows, not a button of its own. */}
            <IconButton
              aria-label={`More in ${item.label}`}
              variant="ghost"
              h="11"
              minW="7"
              w="7"
              rounded="10px"
              color="nav.fgMuted"
              _hover={{ color: "nav.accent" }}
              _focusVisible={{
                outline: "2px solid",
                outlineColor: "nav.accent",
                outlineOffset: "2px",
              }}
            >
              {open ? <ChevronUp /> : <ChevronDown />}
            </IconButton>
          </Menu.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Positioner>
          <Tooltip.Content>More in {item.label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Tooltip.Root>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {item.children?.map((child) => (
              <Menu.Item key={child.href} value={child.href} asChild>
                <NextLink
                  href={child.href}
                  aria-current={isActive(pathname, child.href) ? "page" : undefined}
                >
                  {child.label}
                </NextLink>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
