"use client";

import { useId } from "react";
import NextLink from "next/link";
import { Avatar, Menu, Portal, Tooltip, chakra } from "@chakra-ui/react";
import { useSignOut } from "@/components/auth/sign-out-button";
import { useUser } from "@/components/auth/user-provider";

// Tooltip and menu each stamp an id on the one button and look their trigger
// up by that id when positioning. Left to their own ids, the tooltip's wins
// and the menu anchors to nothing, opening at the page corner. Handing both
// the same trigger id keeps them pointed at the same element.
export function NavAccountMenu() {
  const user = useUser();
  const { signOut, isSigningOut } = useSignOut();
  const triggerId = useId();

  // What the tooltip calls the user: the nickname they chose, else their
  // name, else the email, which is the one thing every account has. `||`
  // rather than `??` because a cleared nickname or name is stored as "".
  const displayName = user.nickName || user.name || user.email;

  return (
    <Menu.Root
      positioning={{ placement: "bottom-end" }}
      ids={{ trigger: triggerId }}
      onSelect={(details) => {
        if (details.value === "logout") void signOut();
      }}
    >
      {/* Both triggers use asChild, so their props merge onto the one
          button: hover shows the tooltip, click opens the menu. */}
      <Tooltip.Root
        openDelay={200}
        positioning={{ placement: "top" }}
        ids={{ trigger: triggerId }}
      >
        <Tooltip.Trigger asChild>
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
        </Tooltip.Trigger>
        <Tooltip.Positioner>
          <Tooltip.Content>{displayName}</Tooltip.Content>
        </Tooltip.Positioner>
      </Tooltip.Root>
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
