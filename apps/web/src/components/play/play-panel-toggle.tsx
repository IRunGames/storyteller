"use client";

import type { ReactNode } from "react";
import { Badge, Box, Button, Float, IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { NAV_DRAWER_BUTTON, useNavDrawer } from "@/components/nav/nav-drawer-context";

type Props = {
  /** What the panel is called: "Chat", "Character". */
  label: string;
  /** The id of the panel it opens and closes. */
  controls: string;
  isOpen: boolean;
  /** What came in while the panel was closed (the chat's new lines); a badge when above nothing. */
  count?: number;
  onToggle: () => void;
  children: ReactNode;
};

/**
 * One of the buttons in the middle of the table's header that opens or
 * closes a panel. A toggle button, so aria-pressed says whether the panel is
 * showing and the name stays the panel's own; the tooltip says what a press
 * will do. Pressed buttons take the header's accent tint, the same way the
 * menu bar marks the page you are on. aria-controls points at the panel even
 * while it is closed, which is allowed: the id names what the button
 * governs, not something that must be in the document.
 *
 * A count puts a small badge on the button's corner and into its name
 * ("Chat, 3 new"), so a screen reader hears what the badge shows. The badge
 * is decorative; the name carries it.
 *
 * In the hamburger's drawer (on a phone, see PlayHeader) it is a row with
 * its name beside the icon and the count after it, and a press closes the
 * drawer too, so the panel it opened is what the player sees next.
 */
export function PlayPanelToggle({ label, controls, isOpen, count = 0, onToggle, children }: Props) {
  const drawer = useNavDrawer();
  const name = count > 0 ? `${label}, ${count} new` : label;
  const badge = count > 99 ? "99+" : count;

  if (drawer) {
    return (
      <Button
        {...NAV_DRAWER_BUTTON}
        aria-label={name}
        aria-pressed={isOpen}
        aria-controls={controls}
        color={isOpen ? "nav.accent" : "nav.icon"}
        bg={isOpen ? "nav.accentTint" : undefined}
        onClick={() => {
          onToggle();
          drawer.close();
        }}
      >
        {children}
        {label}
        {count > 0 && (
          <Box aria-hidden="true" ms="auto">
            <Badge colorPalette="red" variant="solid" rounded="full" size="xs">
              {badge}
            </Badge>
          </Box>
        )}
      </Button>
    );
  }

  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label={name}
          position="relative"
          aria-pressed={isOpen}
          aria-controls={controls}
          variant="ghost"
          boxSize="11"
          rounded="10px"
          color={isOpen ? "nav.accent" : "nav.icon"}
          bg={isOpen ? "nav.accentTint" : undefined}
          onClick={onToggle}
        >
          {children}
          {count > 0 && (
            <Float placement="top-end" offset="2.5">
              <Box aria-hidden="true">
                <Badge colorPalette="red" variant="solid" rounded="full" size="xs">
                  {badge}
                </Badge>
              </Box>
            </Float>
          )}
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>
            {isOpen ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
