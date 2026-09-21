"use client";

import { ClientOnly, IconButton, Menu, Portal, Skeleton, Tooltip } from "@chakra-ui/react";
import { Moon, Sun } from "lucide-react";
import { useColorMode, type ColorMode } from "@/components/ui/color-mode";

const THEMES: { value: ColorMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// A selector rather than a toggle so a third theme is one more entry in THEMES.
export function NavThemeMenu() {
  const { colorMode, setColorMode } = useColorMode();

  return (
    // The resolved theme is unknown during SSR, so the icon can only be
    // chosen on the client — same reason ColorModeButton does this.
    <ClientOnly fallback={<Skeleton boxSize="11" rounded="10px" />}>
      <Menu.Root positioning={{ placement: "bottom-end" }}>
        {/* Both triggers use asChild, so their props merge onto the one
            button: hover shows the tooltip, click opens the menu. */}
        <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
          <Tooltip.Trigger asChild>
            <Menu.Trigger asChild>
              <IconButton
                aria-label="Choose theme"
                variant="ghost"
                boxSize="11"
                rounded="10px"
                color="nav.icon"
              >
                {colorMode === "dark" ? <Moon /> : <Sun />}
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
              <Menu.RadioItemGroup
                value={colorMode}
                onValueChange={(e) => setColorMode(e.value)}
              >
                {THEMES.map((theme) => (
                  <Menu.RadioItem key={theme.value} value={theme.value}>
                    <Menu.ItemIndicator />
                    <Menu.ItemText>{theme.label}</Menu.ItemText>
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
