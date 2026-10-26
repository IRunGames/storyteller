"use client";

import { useId, useState, type ReactNode } from "react";
import NextLink from "next/link";
import { Avatar, Menu, Portal, Tooltip, chakra } from "@chakra-ui/react";
import { CircleAlert, House, Wrench } from "lucide-react";
import { useSignOut } from "@/components/auth/sign-out-button";
import { useUser } from "@/components/auth/user-provider";
import { UserTypeVisibility } from "@/components/auth/user-type-visibility";
import { EnvironmentVisibility } from "@/components/environment/environment-visibility";
import { builtAt, currentEnvironment, isShownIn } from "@/lib/environment";
import { isUserTypeShown, USER_TYPES } from "@/lib/user-types";

// Who sees which of the menu's build items. Cause error is for anywhere but
// production; the environment and version are for storytellers and up.
const CAUSE_ERROR_RULE = { showBelow: "PRODUCTION" } as const;
const BUILD_INFO_RULE = { showAbove: USER_TYPES.unpaidPlayer } as const;

/**
 * A menu item's tooltip, on a span filling the item rather than on the item
 * itself: Tooltip.Trigger asChild would stamp its own id on the item, and the
 * menu finds its items by their ids to highlight and select them.
 */
function ItemTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <chakra.span display="inline-flex" alignItems="center" gap="2" flex="1">
          {children}
        </chakra.span>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

// Tooltip and menu each stamp an id on the one button and look their trigger
// up by that id when positioning. Left to their own ids, the tooltip's wins
// and the menu anchors to nothing, opening at the page corner. Handing both
// the same trigger id keeps them pointed at the same element.
export function NavAccountMenu() {
  const user = useUser();
  const { signOut, isSigningOut } = useSignOut();
  const triggerId = useId();
  const [causeError, setCauseError] = useState(false);

  // The divider above the build items is drawn only when one of them is,
  // so a player in production does not get two dividers with nothing
  // between them. The same rules the items' components apply.
  const showsBuildSection =
    isShownIn(currentEnvironment(), CAUSE_ERROR_RULE) ||
    isUserTypeShown(user.idUserType, BUILD_INFO_RULE);

  // Cause error, outside production only, is how to see (app)/error.tsx without
  // breaking something real. It throws while rendering rather than from the
  // menu's handler because an error boundary only catches errors thrown in
  // render; one thrown from an event handler would never reach the page.
  if (causeError) throw new Error("Cause error, chosen from the account menu.");

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
        if (details.value === "cause-error") setCauseError(true);
      }}
    >
      {/* Both triggers use asChild, so their props merge onto the one
          button: hover shows the tooltip, click opens the menu. */}
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
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
            {showsBuildSection && <Menu.Separator />}
            <EnvironmentVisibility {...CAUSE_ERROR_RULE}>
              <Menu.Item value="cause-error" color="fg.error">
                <CircleAlert />
                Cause error
              </Menu.Item>
            </EnvironmentVisibility>
            {/* Facts about this deployment, not actions: choosing one leaves
                the menu open. */}
            <UserTypeVisibility {...BUILD_INFO_RULE}>
              <Menu.Item value="environment" closeOnSelect={false}>
                <ItemTooltip label={currentEnvironment() ?? "Unknown"}>
                  <Wrench />
                  Environment
                </ItemTooltip>
              </Menu.Item>
              <Menu.Item value="version" closeOnSelect={false}>
                <ItemTooltip label={builtAt() ?? "Build time unknown"}>
                  <House />
                  Version
                </ItemTooltip>
              </Menu.Item>
            </UserTypeVisibility>
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
