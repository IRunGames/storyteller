import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

// Design tokens taken from the "Something Wicked menu bar" Claude Design
// canvas. Only the header reads the nav.* colours; the rest of the app keeps
// Chakra's defaults. Figtree is loaded by next/font in app/layout.tsx, which
// sets the --font-figtree variable this falls back through.
const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        heading: {
          value: 'var(--font-figtree), Figtree, "Segoe UI", system-ui, sans-serif',
        },
        body: {
          value: 'var(--font-figtree), Figtree, "Segoe UI", system-ui, sans-serif',
        },
      },
    },
    semanticTokens: {
      colors: {
        nav: {
          bg: { value: { base: "#ffffff", _dark: "#16181e" } },
          border: { value: { base: "#e6e4df", _dark: "#2a2d36" } },
          fg: { value: { base: "#1f2333", _dark: "#f2f1ee" } },
          fgMuted: { value: { base: "#4a4f5c", _dark: "#b4b8c4" } },
          icon: { value: { base: "#5b6070", _dark: "#b4b8c4" } },
          accent: { value: { base: "#c2410c", _dark: "#f0955c" } },
          accentTint: { value: { base: "#fff4e8", _dark: "#33231a" } },
          avatarBg: { value: { base: "#e8e6e1", _dark: "#2e323c" } },
          avatarFg: { value: { base: "#2b3040", _dark: "#f2f1ee" } },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
