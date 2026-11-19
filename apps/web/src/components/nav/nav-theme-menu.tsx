"use client";

import { Box, ClientOnly, Menu, Portal, Skeleton } from "@chakra-ui/react";
import { useId, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { THEMES, type Theme } from "@/lib/themes";
import { THEME_KEY } from "@/lib/preference-keys";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import {
  BerryIcon,
  FlameIcon,
  PumpkinIcon,
  SnowmanIcon,
  SprigIcon,
  WaveIcon,
  WreathIcon,
} from "./icons";

// The button shows the icon of the theme in force, and each menu item shows
// its own beside its name. The pumpkin, berry, sprig, wave, flame, snowman
// and wreath are the Halloween, Blackberry, Mint, Wave, Ember, White Out and
// Yule themes' own marks (icons.tsx), which is why they are not Lucide icons.
const ICONS: Record<Theme, ReactNode> = {
  light: <Sun />,
  dark: <Moon />,
  halloween: <PumpkinIcon />,
  blackberry: <BerryIcon />,
  mint: <SprigIcon />,
  wave: <WaveIcon />,
  ember: <FlameIcon />,
  whiteout: <SnowmanIcon />,
  yule: <WreathIcon />,
};

// A selector rather than a toggle so a new theme is one more entry in THEMES.
// It reads next-themes directly rather than through the color-mode snippet,
// whose ColorMode type only knows light and dark.
// The button is the menu's trigger and carries a tooltip; both roots share
// the trigger id for the reason WithTooltip gives.
export function NavThemeMenu() {
  const { resolvedTheme, setTheme } = useTheme();
  const theme = (resolvedTheme ?? "dark") as Theme;
  const triggerId = useId();
  const preferences = useUserPreferences();

  // The theme is applied here as well as recorded, rather than left to the
  // preferences provider's effect alone, so the switch does not wait on a
  // render of the whole tree under the provider. Recording it is what lets
  // the provider restore it on the next sign-in, on any browser.
  const choose = (value: string) => {
    setTheme(value);
    void preferences.set(THEME_KEY, value);
  };

  return (
    // The resolved theme is unknown during SSR, so the icon can only be
    // chosen on the client — same reason ColorModeButton does this.
    <ClientOnly fallback={<Skeleton boxSize="11" rounded="10px" />}>
      <Menu.Root positioning={{ placement: "bottom-end" }} ids={{ trigger: triggerId }}>
        <IconButtonWithTooltip
          label="Choose theme"
          tooltip="Set your theme"
          boxSize="11"
          rounded="10px"
          color="nav.icon"
          menuTrigger={triggerId}
          portalled={false}
        >
          {ICONS[theme] ?? <Moon />}
        </IconButtonWithTooltip>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              <Menu.RadioItemGroup value={theme} onValueChange={(e) => choose(e.value)}>
                {THEMES.map((entry) => (
                  <Menu.RadioItem key={entry.value} value={entry.value}>
                    <Menu.ItemIndicator />
                    {/* The themes' marks draw themselves at 28px; here
                        every icon is scaled to the item's
                        text size, Lucide's and the marks alike. */}
                    <Box
                      as="span"
                      data-theme-icon
                      display="inline-flex"
                      boxSize="4"
                      color="nav.icon"
                      css={{ "& svg": { width: "100%", height: "100%" } }}
                    >
                      {ICONS[entry.value]}
                    </Box>
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
