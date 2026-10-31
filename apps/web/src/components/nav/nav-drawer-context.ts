"use client";

import { createContext, useContext } from "react";

/**
 * What a button learns from being inside the hamburger's drawer rather than
 * in a header: that it should draw as a full-width row with its name beside
 * its icon, since the drawer has the width the header lacks and no room for
 * tooltips, and how to close the drawer once pressing it has done its work.
 * Null outside the drawer, where the button keeps its icon-only look.
 */
export type NavDrawerContextValue = { close: () => void };

export const NavDrawerContext = createContext<NavDrawerContextValue | null>(null);

export function useNavDrawer() {
  return useContext(NavDrawerContext);
}

/**
 * The look every such row shares: a ghost button the height of the header's,
 * its icon and name at the start, the size of the drawer's page links so the
 * two lists read as one. Spread before any per-button colour.
 */
export const NAV_DRAWER_BUTTON = {
  variant: "ghost",
  justifyContent: "flex-start",
  w: "full",
  h: "11",
  px: "3.5",
  rounded: "10px",
  fontSize: "lg",
  fontWeight: "semibold",
} as const;
