"use client";

import { useId } from "react";
import NextLink from "next/link";
import { IconButton, Menu, Portal, Tooltip } from "@chakra-ui/react";
import { MailPlus, Wrench } from "lucide-react";
import { UserTypeVisibility } from "@/components/auth/user-type-visibility";
import { USER_TYPES } from "@/lib/user-types";

/**
 * The administrators' tools, one item each, for the wrench menu and the
 * drawer. Invitations is the first; a new tool is one more entry here.
 */
export const ADMIN_ITEMS = [
  { href: "/admin/invitations", label: "Invitations", icon: <MailPlus /> },
] as const;

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
        <Tooltip.Root
          openDelay={200}
          positioning={{ placement: "top" }}
          ids={{ trigger: triggerId }}
        >
          <Tooltip.Trigger asChild>
            <Menu.Trigger asChild>
              <IconButton
                aria-label="Admin tools"
                variant="ghost"
                boxSize="11"
                rounded="10px"
                color="nav.icon"
              >
                <Wrench />
              </IconButton>
            </Menu.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Positioner>
            <Tooltip.Content>Admin</Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              {ADMIN_ITEMS.map((item) => (
                <Menu.Item key={item.href} value={item.href} asChild>
                  <NextLink href={item.href}>
                    {item.icon}
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
