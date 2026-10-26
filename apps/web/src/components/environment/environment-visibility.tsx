import type { ReactNode } from "react";
import { currentEnvironment, isShownIn, type Environment } from "@/lib/environment";

// At least one of the two bounds: with neither, the children could never
// show, which is a mistake rather than something to write on purpose.
type Rule =
  | { showBelow: Environment; showAbove?: Environment }
  | { showBelow?: Environment; showAbove: Environment };

type Props = Rule & {
  /** Rendered in place of the children where they are hidden; nothing if absent. */
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * Shows its children only in the environments its rule allows, by
 * NEXT_PUBLIC_ENVIRONMENT in the order DEV, TEST, STAGING, PRODUCTION:
 * `showBelow="PRODUCTION"` for everything but production, `showAbove="DEV"`
 * for everything but a developer's machine, both for the levels between.
 * The bounds are strict, and anything the rule does not allow is hidden
 * (isShownIn in lib/environment.ts).
 *
 * No "use client" and no hooks: Next writes the variable's value into the
 * server and browser bundles alike at build time, so this works in either
 * kind of component and renders the same on both sides, with nothing to
 * mismatch on hydration.
 */
export function EnvironmentVisibility({ showBelow, showAbove, fallback, children }: Props) {
  return isShownIn(currentEnvironment(), { showBelow, showAbove }) ? children : (fallback ?? null);
}
