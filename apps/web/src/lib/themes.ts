// The one list of themes, read by the menu that offers them and by the
// next-themes provider. It lives here, not in the menu, because next-themes
// only removes the classes it was told about: a theme the provider did not
// know would stay on <html> after the user moved off it, and two theme classes
// at once means two sets of token overrides fighting.
//
// Adding a theme is one entry here, a class in the conditions block of
// theme.ts, and an icon in nav-theme-menu.tsx. A dark theme's class also
// joins the `dark` condition there; a light one's joins the light
// color-scheme rule in its globalCss instead. `dark` here is what the
// colour-mode button reads, since next-themes only knows the theme's name.
export const THEMES = [
  { value: "light", label: "Light", dark: false },
  { value: "dark", label: "Dark", dark: true },
  { value: "halloween", label: "Halloween", dark: true },
  { value: "blackberry", label: "Blackberry", dark: true },
  { value: "mint", label: "Mint", dark: true },
  { value: "wave", label: "Wave", dark: true },
  { value: "ember", label: "Ember", dark: true },
  { value: "whiteout", label: "White Out", dark: false },
  { value: "yule", label: "Yule", dark: true },
] as const;

export type Theme = (typeof THEMES)[number]["value"];

export const THEME_NAMES: Theme[] = THEMES.map((theme) => theme.value);

/**
 * Whether a theme, by the name next-themes resolves, is a dark one. Every
 * tinted theme but White Out is; a name that is not a theme at all (nothing
 * resolved yet) counts as dark, the provider's default.
 */
export function isDarkTheme(theme: string | undefined): boolean {
  return THEMES.find((known) => known.value === theme)?.dark ?? true;
}
