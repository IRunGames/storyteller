"use client";

import { ClientOnly, IconButton, Skeleton, type IconButtonProps } from "@chakra-ui/react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { isDarkTheme } from "@/lib/themes";

export type ColorMode = "light" | "dark";

// Chakra's color-mode snippet, cut down: next-themes resolves to one of the
// app's nine theme names rather than "light" or "dark", so the mode is read
// off the theme list (lib/themes.ts) instead of cast from the name, and the
// snippet's useColorModeValue is gone, since a value that differs per theme
// is a CSS rule on the theme class (docs/standards.md, UI).
export function useColorMode() {
  const { resolvedTheme, setTheme, forcedTheme } = useTheme();
  const colorMode: ColorMode = isDarkTheme(forcedTheme || resolvedTheme) ? "dark" : "light";

  return {
    colorMode,
    setColorMode: setTheme,
    toggleColorMode: () => setTheme(colorMode === "dark" ? "light" : "dark"),
  };
}

export function ColorModeButton(props: Omit<IconButtonProps, "aria-label">) {
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <ClientOnly fallback={<Skeleton boxSize="8" rounded="md" />}>
      <IconButton
        onClick={toggleColorMode}
        variant="ghost"
        size="sm"
        aria-label="Toggle color mode"
        {...props}
      >
        {colorMode === "dark" ? <Moon /> : <Sun />}
      </IconButton>
    </ClientOnly>
  );
}
