"use client";

import { ClientOnly, IconButton, Skeleton, type IconButtonProps } from "@chakra-ui/react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export type ColorMode = "light" | "dark";

export function useColorMode() {
  const { resolvedTheme, setTheme, forcedTheme } = useTheme();
  const colorMode = (forcedTheme || resolvedTheme) as ColorMode;

  return {
    colorMode,
    setColorMode: setTheme,
    toggleColorMode: () => setTheme(colorMode === "dark" ? "light" : "dark"),
  };
}

/** Picks whichever value matches the active color mode. */
export function useColorModeValue<T>(light: T, dark: T) {
  const { colorMode } = useColorMode();
  return colorMode === "dark" ? dark : light;
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
