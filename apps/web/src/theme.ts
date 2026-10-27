import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

// Design tokens taken from the "Something Wicked menu bar" Claude Design
// canvas. Only the header reads the nav.* colours; the rest of the app keeps
// Chakra's defaults. Figtree is loaded by next/font in app/layout.tsx, which
// sets the --font-figtree variable this falls back through.
//
// next-themes puts the chosen theme's name on <html> as a class, and every
// token below switches on that class. Halloween, Blackberry, Mint, Wave and
// Ember are dark themes with their own tint, so rather than restate Chakra's few
// hundred dark values for each, the `dark` condition is widened to match
// their classes too: every Chakra default (menus, popovers, text, borders)
// starts from dark under them, and the `_halloween` / `_blackberry` /
// `_mint` / `_wave` / `_ember` values below override only the tokens that
// carry the theme's colour.
// Chakra emits the per-theme rules after the dark rule, so the override wins
// at equal specificity.
const config = defineConfig({
  conditions: {
    dark: ".dark &, .halloween &, .blackberry &, .mint &, .wave &, .ember &, .dark .chakra-theme:not(.light) &",
    halloween: ".halloween &",
    blackberry: ".blackberry &",
    mint: ".mint &",
    wave: ".wave &",
    ember: ".ember &",
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
        // near-black purple with lavender text; Mint is deep teal with
        // mint-white text and a blue-green accent; Wave is deep ocean navy
        // with ice-blue text and a sky-blue accent; Ember is charred oxblood
        // with ash-white text, peach secondary text and a red-orange coal
        // accent, its second highlight a pale gold. Ember and Halloween are
        // both warm, so Ember keeps the red in its surfaces where Halloween's
        // are black and brown. The surfaces and secondary
        // text carry the hue, not just the accent, or the themes read as
        // plain dark with one coloured logo. The gray.* palette is what ghost
        // buttons, menu items and skeletons use, so it is tinted too.
        bg: {
          DEFAULT: {
            value: {
              _halloween: "#000000",
              _blackberry: "#0e0518",
              _mint: "#03120f",
              _wave: "#030b1a",
              _ember: "#120404",
            },
          },
          subtle: {
            value: {
              _halloween: "#160902",
              _blackberry: "#1c0b33",
              _mint: "#072420",
              _wave: "#071a33",
              _ember: "#220807",
            },
          },
          muted: {
            value: {
              _halloween: "#2a1105",
              _blackberry: "#2e1352",
              _mint: "#0c3a33",
              _wave: "#0c2a4d",
              _ember: "#3a0f0b",
            },
          },
          emphasized: {
            value: {
              _halloween: "#431a06",
              _blackberry: "#45207a",
              _mint: "#125248",
              _wave: "#133c6b",
              _ember: "#5c1a10",
            },
          },
          panel: {
            value: {
              _halloween: "#160902",
              _blackberry: "#1c0b33",
              _mint: "#072420",
              _wave: "#071a33",
              _ember: "#220807",
            },
          },
        },
        fg: {
          DEFAULT: {
            value: {
              _halloween: "#fff3e6",
              _blackberry: "#f7edff",
              _mint: "#ecfdf7",
              _wave: "#eef6ff",
              _ember: "#fff1ea",
            },
          },
          muted: {
            value: {
              _halloween: "#fdba74",
              _blackberry: "#d8b4fe",
              _mint: "#99f6e4",
              _wave: "#93c5fd",
              _ember: "#fdac8a",
            },
          },
          subtle: {
            value: {
              _halloween: "#c2410c",
              _blackberry: "#a855f7",
              _mint: "#2dd4bf",
              _wave: "#3b82f6",
              _ember: "#e2492b",
            },
          },
        },
        border: {
          DEFAULT: {
            value: {
              _halloween: "#431a06",
              _blackberry: "#45207a",
              _mint: "#125248",
              _wave: "#133c6b",
              _ember: "#5c1a10",
            },
          },
          muted: {
            value: {
              _halloween: "#2a1105",
              _blackberry: "#2e1352",
              _mint: "#0c3a33",
              _wave: "#0c2a4d",
              _ember: "#3a0f0b",
            },
          },
          subtle: {
            value: {
              _halloween: "#160902",
              _blackberry: "#1c0b33",
              _mint: "#072420",
              _wave: "#071a33",
              _ember: "#220807",
            },
          },
          emphasized: {
            value: {
              _halloween: "#9a3412",
              _blackberry: "#6b21a8",
              _mint: "#0f766e",
              _wave: "#1d4ed8",
              _ember: "#b42318",
            },
          },
        },
        gray: {
          contrast: {
            value: {
              _halloween: "#000000",
              _blackberry: "#0e0518",
              _mint: "#03120f",
              _wave: "#030b1a",
              _ember: "#120404",
            },
          },
          fg: {
            value: {
              _halloween: "#fdba74",
              _blackberry: "#e9d5ff",
              _mint: "#ccfbf1",
              _wave: "#dbeafe",
              _ember: "#fed7c4",
            },
          },
          subtle: {
            value: {
              _halloween: "#2a1105",
              _blackberry: "#2e1352",
              _mint: "#0c3a33",
              _wave: "#0c2a4d",
              _ember: "#3a0f0b",
            },
          },
          muted: {
            value: {
              _halloween: "#431a06",
              _blackberry: "#45207a",
              _mint: "#125248",
              _wave: "#133c6b",
              _ember: "#5c1a10",
            },
          },
          emphasized: {
            value: {
              _halloween: "#9a3412",
              _blackberry: "#6b21a8",
              _mint: "#0f766e",
              _wave: "#1d4ed8",
              _ember: "#b42318",
            },
          },
          solid: {
            value: {
              _halloween: "#f97316",
              _blackberry: "#c084fc",
              _mint: "#5eead4",
              _wave: "#38bdf8",
              _ember: "#ff6a3d",
            },
          },
          focusRing: {
            value: {
              _halloween: "#f97316",
              _blackberry: "#c084fc",
              _mint: "#5eead4",
              _wave: "#38bdf8",
              _ember: "#ff6a3d",
            },
          },
          border: {
            value: {
              _halloween: "#431a06",
              _blackberry: "#45207a",
              _mint: "#125248",
              _wave: "#133c6b",
              _ember: "#5c1a10",
            },
          },
        },
        // The status pill: the theme's highlight, and the colour that reads
        // on it. Every pill is the highlight at full strength — nothing is
        // mixed or graded — so these two are the whole palette. They repeat
        // nav.accent and nav.bg rather than reading them because nav.* is the
        // header's alone (docs/standards.md), and a pill is not the header.
        status: {
          accent: {
            value: {
              base: "#c2410c",
              _dark: "#f0955c",
              _halloween: "#f97316",
              _blackberry: "#c084fc",
              _mint: "#5eead4",
              _wave: "#38bdf8",
              _ember: "#ff6a3d",
            },
          },
          // The theme's own background, which is what the highlight was
          // chosen to stand out against, so the contrast holds everywhere
          // without a second palette.
          contrast: {
            value: {
              base: "#ffffff",
              _dark: "#16181e",
              _halloween: "#000000",
              _blackberry: "#14072a",
              _mint: "#061d19",
              _wave: "#051428",
              _ember: "#1a0605",
            },
          },
        },
        // The border and glow round an element the storyteller has hidden
        // from the players in the run page's play space. The theme's
        // highlight, repeated for the reason play.* repeats it: each belongs
        // to its own component.
        run: {
          // A pill's initial name, and its reveal icon: a second highlight
          // beside the theme's own, a hue across the wheel from it, so the
          // name the players know reads apart from the plain names around it
          // and from the hidden pills' border.
          initialName: {
            value: {
              base: "#0f766e",
              _dark: "#5eead4",
              _halloween: "#c084fc",
              _blackberry: "#f9a8d4",
              _mint: "#fcd34d",
              _wave: "#fbbf24",
              _ember: "#fde68a",
            },
          },
          hidden: {
            value: {
              base: "#c2410c",
              _dark: "#f0955c",
              _halloween: "#f97316",
              _blackberry: "#c084fc",
              _mint: "#5eead4",
              _wave: "#38bdf8",
              _ember: "#ff6a3d",
            },
          },
          // The glow round a pill's thumbnail while the players have its
          // picture open full size (the tack). The second highlight, as the
          // initial name is, so it is never mistaken for the hidden pill's
          // glow beside it.
          pictureUp: {
            value: {
              base: "#0f766e",
              _dark: "#5eead4",
              _halloween: "#c084fc",
              _blackberry: "#f9a8d4",
              _mint: "#fcd34d",
              _wave: "#fbbf24",
              _ember: "#fde68a",
            },
          },
        },
        // A story card's Play when there is something to go to: players
        // waiting for the storyteller (with the outline round the card), or
        // a session in progress for a player. The theme's highlight again,
        // repeated rather than read from status.* for the reason status.*
        // repeats nav.*: each belongs to its own component. The card's text
        // is white over a darkened cover in every theme, so contrast here is
        // only the button's label against the highlight, which is what
        // status.contrast was chosen for too.
        play: {
          accent: {
            value: {
              base: "#c2410c",
              _dark: "#f0955c",
              _halloween: "#f97316",
              _blackberry: "#c084fc",
              _mint: "#5eead4",
              _wave: "#38bdf8",
              _ember: "#ff6a3d",
            },
          },
          contrast: {
            value: {
              base: "#ffffff",
              _dark: "#16181e",
              _halloween: "#000000",
              _blackberry: "#14072a",
              _mint: "#061d19",
              _wave: "#051428",
              _ember: "#1a0605",
            },
          },
        },
        nav: {
          bg: {
            value: {
              base: "#ffffff",
              _dark: "#16181e",
              _halloween: "#000000",
              _blackberry: "#14072a",
              _mint: "#061d19",
              _wave: "#051428",
              _ember: "#1a0605",
            },
          },
          border: {
            value: {
              base: "#e6e4df",
              _dark: "#2a2d36",
              _halloween: "#431a06",
              _blackberry: "#45207a",
              _mint: "#125248",
              _wave: "#133c6b",
              _ember: "#5c1a10",
            },
          },
          fg: {
            value: {
              base: "#1f2333",
              _dark: "#f2f1ee",
              _halloween: "#fff3e6",
              _blackberry: "#f7edff",
              _mint: "#ecfdf7",
              _wave: "#eef6ff",
              _ember: "#fff1ea",
            },
          },
          fgMuted: {
            value: {
              base: "#4a4f5c",
              _dark: "#b4b8c4",
              _halloween: "#fdba74",
              _blackberry: "#d8b4fe",
              _mint: "#99f6e4",
              _wave: "#93c5fd",
              _ember: "#fdac8a",
            },
          },
          icon: {
            value: {
              base: "#5b6070",
              _dark: "#b4b8c4",
              _halloween: "#fb923c",
              _blackberry: "#c084fc",
              _mint: "#5eead4",
              _wave: "#38bdf8",
              _ember: "#ff6a3d",
            },
          },
          accent: {
            value: {
              base: "#c2410c",
              _dark: "#f0955c",
              _halloween: "#f97316",
              _blackberry: "#c084fc",
              _mint: "#5eead4",
              _wave: "#38bdf8",
              _ember: "#ff6a3d",
            },
          },
          accentTint: {
            value: {
              base: "#fff4e8",
              _dark: "#33231a",
              _halloween: "#431a06",
              _blackberry: "#45207a",
              _mint: "#125248",
              _wave: "#133c6b",
              _ember: "#5c1a10",
            },
          },
          avatarBg: {
            value: {
              base: "#e8e6e1",
              _dark: "#2e323c",
              _halloween: "#9a3412",
              _blackberry: "#6b21a8",
              _mint: "#0f766e",
              _wave: "#1d4ed8",
              _ember: "#b42318",
            },
          },
          avatarFg: {
            value: {
              base: "#2b3040",
              _dark: "#f2f1ee",
              _halloween: "#fff3e6",
              _blackberry: "#f7edff",
              _mint: "#ecfdf7",
              _wave: "#eef6ff",
              _ember: "#fff1ea",
            },
          },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
