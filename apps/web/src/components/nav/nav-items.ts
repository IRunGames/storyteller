import { Dices, MailPlus, Users } from "lucide-react";

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
  { label: "Store", href: "/store" },
];

/**
 * The administrators' tools, one item each, for the wrench menu and the
 * drawer. A new tool is one more entry here. Each icon is the component
 * rather than a drawn element, so the list holds no markup; the menu draws
 * it.
 */
export const ADMIN_ITEMS = [
  { href: "/admin/invitations", label: "Invitations", icon: MailPlus },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/systems", label: "Systems", icon: Dices },
] as const;

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
