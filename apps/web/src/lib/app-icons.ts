import type { Metadata } from "next";
import { isShownIn, type Environment } from "./environment";

// The app's icons, chosen by environment so a tab of the local app is told
// from a tab of the real one at a glance: production wears the Storyteller
// mark (public/icons/production), everything below it the gold d20
// (public/icons/dev). Served from public/ and named in the layout's
// metadata rather than as src/app/icon.png and friends, which Next would
// use for every build alike. The rule reads as environment-visibility.tsx's
// do: the dev set is shown strictly below PRODUCTION, so an environment the
// build does not know (null, only under test) gets production's.

export type AppIconSet = "production" | "dev";

/** Which set this environment wears. */
export function appIconSet(environment: Environment | null): AppIconSet {
  return isShownIn(environment, { showBelow: "PRODUCTION" }) ? "dev" : "production";
}

/** The layout's metadata.icons for the set: the .ico, the PNG and the Apple touch icon. */
export function appIcons(environment: Environment | null): NonNullable<Metadata["icons"]> {
  const set = appIconSet(environment);
  return {
    icon: [
      { url: `/icons/${set}/favicon.ico`, sizes: "48x48", type: "image/x-icon" },
      { url: `/icons/${set}/icon.png`, type: "image/png" },
    ],
    apple: `/icons/${set}/apple-icon.png`,
  };
}
