"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { ThemeProvider, type ThemeProviderProps } from "next-themes";
import { system } from "@/theme";
import { THEME_NAMES } from "@/lib/themes";

export function Provider(props: ThemeProviderProps) {
  return (
    <ChakraProvider value={system}>
      {/* `themes` is the list next-themes clears from <html> before adding
          the new class; without it only "light" and "dark" are cleared. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        themes={THEME_NAMES}
        disableTransitionOnChange
        {...props}
      />
    </ChakraProvider>
  );
}
