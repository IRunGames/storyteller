"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_ELEMENT_SHOWING,
  elementIdOf,
  playItemKey,
  withShowing,
  type SceneItem,
} from "@/lib/scene-elements";
import type { ElementDetail } from "@/lib/run";

/**
 * Everything in a table's play space and every way it changes, which the
 * table hands down through SceneItemsProvider so a pill, its panel and the
 * library change the one list without being handed a callback for each
 * change (scene-items-context.tsx).
 */
export type SceneItems = {
  /** What is in the play space, in the order it was brought in. */
  items: SceneItem[];
  /** The space read afresh: what it holds now, in place of everything. */
  load: (items: SceneItem[]) => void;
  /** Something brought in; an item already in play stays where it is rather than going in twice. */
  put: (item: SceneItem) => void;
  /** An item taken off the play space, by key. */
  remove: (key: string) => void;
  /**
   * One link taken out of the scene: its pill goes, and an element in the
   * scene twice keeps its other pill.
   */
  removeLink: (idSceneElement: number) => void;
  /**
   * An item edited or moved, in place. Matched by its element id rather than
   * its key, which carries the kind: an edit that changes the kind comes back
   * under a new key.
   */
  replace: (item: SceneItem) => void;
  /**
   * An element's picture changed, or whether it is annotated: its pill, if it
   * is in play, shows the new one, and opens the annotator from it while it
   * is annotated (annotated, false unless said).
   */
  setImage: (idElement: number, imageUrl: string | null, annotated?: boolean) => void;
  /**
   * An element edited as the story holds it: its pill, if it is in play,
   * takes the new fields, keeps the field it was showing, and moves under
   * its new kind's key if the kind changed.
   */
  editElement: (element: ElementDetail) => void;
  /** An item's status in the scene, by key. */
  setStatus: (key: string, status: string) => void;
  /**
   * A link's status, info toggle or health changed from its panel or its
   * stats, by the link: an element may be in the scene more than once, and
   * the change is one pill's. A health of undefined takes the drop away.
   */
  patchLink: (
    idSceneElement: number,
    change: Pick<Partial<SceneItem>, "sceneStatus" | "showInfo" | "health">,
  ) => void;
  /**
   * Manage stacks saved with renames: a renamed stack takes its pills with
   * it, as the action took their links.
   */
  renameTags: (renamed: (tag: string) => string) => void;
};

/**
 * The list behind a table's play space, with the one reducer for each
 * change the tables used to write for themselves. Every function keeps its
 * identity for the life of the table, so the stats pane can hand setStatus
 * to each of its memoised rows and a provider's value changes only with the
 * items.
 */
export function useSceneItems(initial: SceneItem[]): SceneItems {
  const [items, setItems] = useState<SceneItem[]>(initial);

  const load = useCallback((next: SceneItem[]) => setItems(next), []);
  const put = useCallback(
    (item: SceneItem) =>
      setItems((current) =>
        current.some((existing) => existing.key === item.key) ? current : [...current, item],
      ),
    [],
  );
  const remove = useCallback(
    (key: string) => setItems((current) => current.filter((existing) => existing.key !== key)),
    [],
  );
  const removeLink = useCallback(
    (idSceneElement: number) =>
      setItems((current) =>
        current.filter((existing) => existing.idSceneElement !== idSceneElement),
      ),
    [],
  );
  const replace = useCallback(
    (item: SceneItem) =>
      setItems((current) =>
        current.map((existing) =>
          existing.kind !== "ATTACHMENT" && elementIdOf(existing) === elementIdOf(item)
            ? item
            : existing,
        ),
      ),
    [],
  );
  const setImage = useCallback(
    (idElement: number, imageUrl: string | null, annotated = false) =>
      setItems((current) =>
        current.map((existing) => {
          if (existing.kind === "ATTACHMENT" || elementIdOf(existing) !== idElement) {
            return existing;
          }
          const { annotated: _was, ...rest } = existing;
          return annotated ? { ...rest, imageUrl, annotated: true } : { ...rest, imageUrl };
        }),
      ),
    [],
  );
  const editElement = useCallback(
    (element: ElementDetail) =>
      setItems((current) =>
        current.map((existing) => {
          if (existing.kind === "ATTACHMENT" || elementIdOf(existing) !== element.idElement) {
            return existing;
          }
          const moved: SceneItem = {
            ...existing,
            key: playItemKey(element.kind, element.idElement, existing.idSceneElement),
            kind: element.kind as SceneItem["kind"],
            imageUrl: element.imageUrl,
          };
          // Something the page alone holds has no fields to choose among.
          if (!existing.fields) return { ...moved, label: element.name, detail: element.title };
          return withShowing(
            {
              ...moved,
              fields: {
                initial_name: element.initialName,
                name: element.name,
                title: element.title,
                label: existing.fields.label,
              },
            },
            existing.showing ?? DEFAULT_ELEMENT_SHOWING,
          );
        }),
      ),
    [],
  );
  const setStatus = useCallback(
    (key: string, status: string) =>
      setItems((current) =>
        current.map((existing) =>
          existing.key === key ? { ...existing, sceneStatus: status } : existing,
        ),
      ),
    [],
  );
  const patchLink = useCallback(
    (
      idSceneElement: number,
      change: Pick<Partial<SceneItem>, "sceneStatus" | "showInfo" | "health">,
    ) =>
      setItems((current) =>
        current.map((existing) =>
          existing.idSceneElement === idSceneElement ? { ...existing, ...change } : existing,
        ),
      ),
    [],
  );
  const renameTags = useCallback(
    (renamed: (tag: string) => string) =>
      setItems((current) =>
        current.map((existing) =>
          existing.sceneTags
            ? { ...existing, sceneTags: existing.sceneTags.map(renamed) }
            : existing,
        ),
      ),
    [],
  );

  return useMemo(
    () => ({
      items,
      load,
      put,
      remove,
      removeLink,
      replace,
      setImage,
      editElement,
      setStatus,
      patchLink,
      renameTags,
    }),
    [
      items,
      load,
      put,
      remove,
      removeLink,
      replace,
      setImage,
      editElement,
      setStatus,
      patchLink,
      renameTags,
    ],
  );
}
