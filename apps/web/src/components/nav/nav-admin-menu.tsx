"use client";

import { useId } from "react";
import NextLink from "next/link";
import { Menu, Portal } from "@chakra-ui/react";
import { Wrench } from "lucide-react";
import { UserTypeVisibility } from "@/components/auth/user-type-visibility";
import { USER_TYPES } from "@/lib/user-types";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { ADMIN_ITEMS } from "./nav-items";

/**
 * Only an administrator's: showAbove is strict and a smaller id is more
 * powerful, so above the paid storyteller is administrators alone. This only
 * decides what is drawn; each page and action checks requireAdmin() itself.
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  return <UserTypeVisibility showAbove={USER_TYPES.paidStoryteller}>{children}</UserTypeVisibility>;
}

/**
 * The header's wrench, for administrators, opening a menu of their tools.
 * Tooltip and menu share one trigger id for the reason nav-theme-menu.tsx
 * gives.
 */
export function NavAdminMenu() {
  const triggerId = useId();

  return (
    <AdminOnly>
      <Menu.Root positioning={{ placement: "bottom-end" }} ids={{ trigger: triggerId }}>
        <IconButtonWithTooltip
          label="Admin tools"
          tooltip="Admin"
          boxSize="11"
          rounded="10px"
          color="nav.icon"
          menuTrigger={triggerId}
          portalled={false}
        >
          <Wrench />
        </IconButtonWithTooltip>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              {ADMIN_ITEMS.map((item) => (
                <Menu.Item key={item.href} value={item.href} asChild>
                  <NextLink href={item.href}>
                    <item.icon />
                    {item.label}
                  </NextLink>
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </AdminOnly>
  );
}
