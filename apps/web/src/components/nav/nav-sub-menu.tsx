"use client";

import { useId, useState } from "react";
import NextLink from "next/link";
import { Menu, Portal } from "@chakra-ui/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
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
      {/* Narrower than the header's other icon buttons so the chevron reads as
          part of the pill it follows, not a button of its own. */}
      <IconButtonWithTooltip
        label={`More in ${item.label}`}
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
        menuTrigger={triggerId}
        portalled={false}
      >
        {open ? <ChevronUp /> : <ChevronDown />}
      </IconButtonWithTooltip>
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
