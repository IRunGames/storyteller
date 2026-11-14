"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { ThemeProvider, type ThemeProviderProps } from "next-themes";
import { system } from "@/theme";
import { THEME_NAMES } from "@/lib/themes";

export function Provider(props: ThemeProviderProps) {
  return (
    <ChakraProvider value={system}>
      {/* `themes` is the list next-themes clears from <html> before adding
          the new class; without it only "light" and "dark" are cleared.
          color-scheme is set from the theme class in theme.ts's globalCss,
          since next-themes would give White Out, a light theme, the dark
          scheme of its default theme. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        themes={THEME_NAMES}
        enableColorScheme={false}
        disableTransitionOnChange
        {...props}
      />
    </ChakraProvider>
  );
}
