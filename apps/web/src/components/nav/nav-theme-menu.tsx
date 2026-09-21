"use client";

import { ClientOnly, IconButton, Menu, Portal, Skeleton, Tooltip } from "@chakra-ui/react";
import { useId } from "react";
import { Moon, Sun } from "lucide-react";
import { useColorMode, type ColorMode } from "@/components/ui/color-mode";

const THEMES: { value: ColorMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// A selector rather than a toggle so a third theme is one more entry in THEMES.
// Tooltip and menu each stamp an id on the one button and look their trigger
// up by that id when positioning. Left to their own ids, the tooltip's wins
// and the menu anchors to nothing, opening at the page corner. Handing both
// the same trigger id keeps them pointed at the same element.
export function NavThemeMenu() {
  const { colorMode, setColorMode } = useColorMode();
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
