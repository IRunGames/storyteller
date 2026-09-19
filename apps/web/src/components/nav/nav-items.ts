export interface NavItem {
  label: string;
  href: string;
}

// "Stories" and the signed-in home are the same page.
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Play", href: "/play" },
  { label: "Stories", href: "/home" },
  { label: "Characters", href: "/characters" },
  { label: "Library", href: "/library" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
