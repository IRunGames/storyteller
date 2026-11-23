"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SceneItems } from "./use-scene-items";

const SceneItemsContext = createContext<SceneItems | null>(null);
// patchLink alone, which keeps its identity while the list changes, for a
// part that only tells the pills something and must not be drawn again
// every time any pill changes (useOptionalPatchLink).
const PatchLinkContext = createContext<SceneItems["patchLink"] | null>(null);

/**
 * One provider per table, round everything that draws or changes the play
 * space: the stacks, their pills, the pills' panels and the library. Each
 * reaches the list with useSceneItemsContext() and changes it directly, in place of
 * the table handing a callback for every change down through each of them.
 * The value is what the table's useSceneItems (use-scene-items.ts) returns.
 */
export function SceneItemsProvider({
  value,
  children,
}: {
  value: SceneItems;
  children: ReactNode;
}) {
  return (
    <SceneItemsContext.Provider value={value}>
      <PatchLinkContext.Provider value={value.patchLink}>{children}</PatchLinkContext.Provider>
    </SceneItemsContext.Provider>
  );
}

/** The table's play space, from the nearest SceneItemsProvider. */
export function useSceneItemsContext(): SceneItems {
  const value = useContext(SceneItemsContext);
  if (!value) {
    throw new Error("useSceneItemsContext needs a SceneItemsProvider round the table.");
  }
  return value;
}

/**
 * The table's patchLink where there is a table, null elsewhere: for a part
 * drawn both at a table and away from one (the stat blocks, on the prep
 * pages too), which tells the table's pills only when it is at a table.
 * Read apart from the list, so the part is not drawn again whenever a pill
 * changes (the stats pane memoises its rows for that).
 */
export function useOptionalPatchLink(): SceneItems["patchLink"] | null {
  return useContext(PatchLinkContext);
}
