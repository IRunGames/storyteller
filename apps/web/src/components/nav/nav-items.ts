export interface NavItem {
  label: string;
  href: string;
}

// The signed-in home (/home) is not listed: the brand mark links there.
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Play", href: "/play" },
  { label: "Stories", href: "/stories" },
  { label: "Characters", href: "/characters" },
  { label: "Library", href: "/library" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
