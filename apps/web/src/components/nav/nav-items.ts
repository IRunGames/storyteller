export interface NavItem {
  label: string;
  href: string;
  /**
   * Sub-pages of this section. The header shows them in a menu behind a
   * chevron beside the section's pill; the drawer lists them under it.
   */
  children?: readonly NavItem[];
}

// The signed-in home (/home) is not listed: the brand mark links there.
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Play", href: "/play" },
  {
    label: "Stories",
    href: "/stories",
    children: [{ label: "Find a Story", href: "/stories/find" }],
  },
  { label: "Characters", href: "/characters" },
  { label: "Library", href: "/library" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
