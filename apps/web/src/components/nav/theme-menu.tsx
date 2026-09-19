"use client";

import { ClientOnly, IconButton, Menu, Portal, Skeleton } from "@chakra-ui/react";
import {
  MoonIcon,
  SunIcon,
  useColorMode,
  type ColorMode,
} from "@/components/ui/color-mode";

const THEMES: { value: ColorMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// A selector rather than a toggle so a third theme is one more entry in THEMES.
export function ThemeMenu() {
  const { colorMode, setColorMode } = useColorMode();

  return (
    // The resolved theme is unknown during SSR, so the icon can only be
    // chosen on the client — same reason ColorModeButton does this.
    <ClientOnly fallback={<Skeleton boxSize="11" rounded="10px" />}>
      <Menu.Root positioning={{ placement: "bottom-end" }}>
        <Menu.Trigger asChild>
          <IconButton
            aria-label="Choose theme"
            variant="ghost"
            boxSize="11"
            rounded="10px"
            color="nav.icon"
          >
            {colorMode === "dark" ? <MoonIcon /> : <SunIcon />}
          </IconButton>
        </Menu.Trigger>
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
