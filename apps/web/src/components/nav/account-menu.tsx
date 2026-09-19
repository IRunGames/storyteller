"use client";

import NextLink from "next/link";
import { Avatar, Menu, Portal, chakra } from "@chakra-ui/react";
import { useSignOut } from "@/components/auth/sign-out-button";

export interface HeaderUser {
  name: string;
  image?: string | null;
}

export function AccountMenu({ user }: { user: HeaderUser }) {
  const { signOut, isSigningOut } = useSignOut();

  return (
    <Menu.Root
      positioning={{ placement: "bottom-end" }}
      onSelect={(details) => {
        if (details.value === "logout") void signOut();
      }}
    >
      <Menu.Trigger asChild>
        <chakra.button
          type="button"
          aria-label="Account menu"
          display="inline-flex"
          rounded="full"
          cursor="pointer"
          _focusVisible={{
            outline: "2px solid",
            outlineColor: "nav.accent",
            outlineOffset: "2px",
          }}
        >
          <Avatar.Root
            boxSize="11"
            bg="nav.avatarBg"
            color="nav.avatarFg"
            fontSize="15px"
            fontWeight="semibold"
            letterSpacing="0.02em"
          >
            <Avatar.Fallback name={user.name} />
            {user.image && <Avatar.Image src={user.image} />}
          </Avatar.Root>
        </chakra.button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            <Menu.Item value="profile" asChild>
              <NextLink href="/profile">Profile</NextLink>
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item value="logout" disabled={isSigningOut}>
              Logout
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
