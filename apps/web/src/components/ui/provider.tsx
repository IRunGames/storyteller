"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { ThemeProvider, type ThemeProviderProps } from "next-themes";
import { system } from "@/theme";

export function Provider(props: ThemeProviderProps) {
  return (
    <ChakraProvider value={system}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        {...props}
      />
    </ChakraProvider>
  );
}
