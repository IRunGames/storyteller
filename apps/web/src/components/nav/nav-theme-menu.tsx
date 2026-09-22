"use client";

import { ClientOnly, IconButton, Menu, Portal, Skeleton, Tooltip } from "@chakra-ui/react";
import { useId, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { THEMES, type Theme } from "@/lib/themes";
import { BerryIcon, PumpkinIcon } from "./icons";

// The button shows the icon of the theme in force. The pumpkin and berry are
// the Halloween and Blackberry brand marks reused, which is why they are not
// Lucide icons.
const ICONS: Record<Theme, ReactNode> = {
  light: <Sun />,
  dark: <Moon />,
  halloween: <PumpkinIcon />,
  blackberry: <BerryIcon />,
};

// A selector rather than a toggle so a new theme is one more entry in THEMES.
// It reads next-themes directly rather than through the color-mode snippet,
// whose ColorMode type only knows light and dark.
// Tooltip and menu each stamp an id on the one button and look their trigger
// up by that id when positioning. Left to their own ids, the tooltip's wins
// and the menu anchors to nothing, opening at the page corner. Handing both
// the same trigger id keeps them pointed at the same element.
export function NavThemeMenu() {
  const { resolvedTheme, setTheme } = useTheme();
  const theme = (resolvedTheme ?? "dark") as Theme;
  const triggerId = useId();

  return (
    // The resolved theme is unknown during SSR, so the icon can only be
    // chosen on the client — same reason ColorModeButton does this.
    <ClientOnly fallback={<Skeleton boxSize="11" rounded="10px" />}>
      <Menu.Root positioning={{ placement: "bottom-end" }} ids={{ trigger: triggerId }}>
        {/* Both triggers use asChild, so their props merge onto the one
            button: hover shows the tooltip, click opens the menu. */}
        <Tooltip.Root
          openDelay={200}
          positioning={{ placement: "top" }}
          ids={{ trigger: triggerId }}
        >
          <Tooltip.Trigger asChild>
            <Menu.Trigger asChild>
              <IconButton
                aria-label="Choose theme"
                variant="ghost"
                boxSize="11"
                rounded="10px"
                color="nav.icon"
              >
                {ICONS[theme] ?? <Moon />}
              </IconButton>
            </Menu.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Positioner>
            <Tooltip.Content>Set your theme</Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              <Menu.RadioItemGroup value={theme} onValueChange={(e) => setTheme(e.value)}>
                {THEMES.map((entry) => (
                  <Menu.RadioItem key={entry.value} value={entry.value}>
                    <Menu.ItemIndicator />
                    <Menu.ItemText>{entry.label}</Menu.ItemText>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioItemGroup>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </ClientOnly>
  );
}
