import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

// Design tokens taken from the "Something Wicked menu bar" Claude Design
// canvas. Only the header reads the nav.* colours; the rest of the app keeps
// Chakra's defaults. Figtree is loaded by next/font in app/layout.tsx, which
// sets the --font-figtree variable this falls back through.
//
// next-themes puts the chosen theme's name on <html> as a class, and every
// token below switches on that class. Halloween and Blackberry are dark
// themes with their own tint, so rather than restate Chakra's few hundred
// dark values for each, the `dark` condition is widened to match their
// classes too: every Chakra default (menus, popovers, text, borders) starts
// from dark under them, and the `_halloween` / `_blackberry` values below
// override only the tokens that carry the theme's colour. Chakra emits the
// per-theme rules after the dark rule, so the override wins at equal
// specificity.
const config = defineConfig({
  conditions: {
    dark: ".dark &, .halloween &, .blackberry &, .dark .chakra-theme:not(.light) &",
    halloween: ".halloween &",
    blackberry: ".blackberry &",
  },
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
        // Chakra's own surface, text and border tokens. Halloween is true
        // black with burnt-orange surfaces and orange text; Blackberry is
        // near-black purple with lavender text. The surfaces and secondary
        // text carry the hue, not just the accent, or the themes read as
        // plain dark with one coloured logo. The gray.* palette is what ghost
        // buttons, menu items and skeletons use, so it is tinted too.
        bg: {
          DEFAULT: { value: { _halloween: "#000000", _blackberry: "#0e0518" } },
          subtle: { value: { _halloween: "#160902", _blackberry: "#1c0b33" } },
          muted: { value: { _halloween: "#2a1105", _blackberry: "#2e1352" } },
          emphasized: { value: { _halloween: "#431a06", _blackberry: "#45207a" } },
          panel: { value: { _halloween: "#160902", _blackberry: "#1c0b33" } },
        },
        fg: {
          DEFAULT: { value: { _halloween: "#fff3e6", _blackberry: "#f7edff" } },
          muted: { value: { _halloween: "#fdba74", _blackberry: "#d8b4fe" } },
          subtle: { value: { _halloween: "#c2410c", _blackberry: "#a855f7" } },
        },
        border: {
          DEFAULT: { value: { _halloween: "#431a06", _blackberry: "#45207a" } },
          muted: { value: { _halloween: "#2a1105", _blackberry: "#2e1352" } },
          subtle: { value: { _halloween: "#160902", _blackberry: "#1c0b33" } },
          emphasized: { value: { _halloween: "#9a3412", _blackberry: "#6b21a8" } },
        },
        gray: {
          contrast: { value: { _halloween: "#000000", _blackberry: "#0e0518" } },
          fg: { value: { _halloween: "#fdba74", _blackberry: "#e9d5ff" } },
          subtle: { value: { _halloween: "#2a1105", _blackberry: "#2e1352" } },
          muted: { value: { _halloween: "#431a06", _blackberry: "#45207a" } },
          emphasized: { value: { _halloween: "#9a3412", _blackberry: "#6b21a8" } },
          solid: { value: { _halloween: "#f97316", _blackberry: "#c084fc" } },
          focusRing: { value: { _halloween: "#f97316", _blackberry: "#c084fc" } },
          border: { value: { _halloween: "#431a06", _blackberry: "#45207a" } },
        },
        nav: {
          bg: {
            value: {
              base: "#ffffff",
              _dark: "#16181e",
              _halloween: "#000000",
              _blackberry: "#14072a",
            },
          },
          border: {
            value: {
              base: "#e6e4df",
              _dark: "#2a2d36",
              _halloween: "#431a06",
              _blackberry: "#45207a",
            },
          },
          fg: {
            value: {
              base: "#1f2333",
              _dark: "#f2f1ee",
              _halloween: "#fff3e6",
              _blackberry: "#f7edff",
            },
          },
          fgMuted: {
            value: {
              base: "#4a4f5c",
              _dark: "#b4b8c4",
              _halloween: "#fdba74",
              _blackberry: "#d8b4fe",
            },
          },
          icon: {
            value: {
              base: "#5b6070",
              _dark: "#b4b8c4",
              _halloween: "#fb923c",
              _blackberry: "#c084fc",
            },
          },
          accent: {
            value: {
              base: "#c2410c",
              _dark: "#f0955c",
              _halloween: "#f97316",
              _blackberry: "#c084fc",
            },
          },
          accentTint: {
            value: {
              base: "#fff4e8",
              _dark: "#33231a",
              _halloween: "#431a06",
              _blackberry: "#45207a",
            },
          },
          avatarBg: {
            value: {
              base: "#e8e6e1",
              _dark: "#2e323c",
              _halloween: "#9a3412",
              _blackberry: "#6b21a8",
            },
          },
          avatarFg: {
            value: {
              base: "#2b3040",
              _dark: "#f2f1ee",
              _halloween: "#fff3e6",
              _blackberry: "#f7edff",
            },
          },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
