// The one list of themes, read by the menu that offers them and by the
// next-themes provider. It lives here, not in the menu, because next-themes
// only removes the classes it was told about: a theme the provider did not
// know would stay on <html> after the user moved off it, and two theme classes
// at once means two sets of token overrides fighting.
//
// Adding a theme is one entry here, a class in the conditions block of
// theme.ts, and an icon in nav-theme-menu.tsx.
export const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "halloween", label: "Halloween" },
  { value: "blackberry", label: "Blackberry" },
] as const;

export type Theme = (typeof THEMES)[number]["value"];

export const THEME_NAMES: Theme[] = THEMES.map((theme) => theme.value);
